import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSpokenBlocks, computeSpokenContentHash } from "@/lib/audio/text-extractor";
import { chunkSpokenBlocks } from "@/lib/audio/chunker";
import { generateFullArticleAudio } from "@/lib/audio/nvidia-tts";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: articleId } = await params;
  const admin = createSupabaseAdmin();
  const supabaseServer = await createSupabaseServer();

  const { data: article } = await admin
    .from("articles")
    .select("id, title, excerpt, body, status, visibility, owner_id")
    .eq("id", articleId)
    .single();

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Authorization check matching article detail page
  const { data: { user } } = await supabaseServer.auth.getUser();
  const isRestricted = ["draft", "archived", "expired", "rejected"].includes(article.status) || article.visibility === "private";

  if (isRestricted) {
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (user.id !== article.owner_id) {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "admin" || profile?.status !== "active") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const spokenBlocks = extractSpokenBlocks(article);
  const contentHash = computeSpokenContentHash(spokenBlocks);

  const { data: audioRecord } = await admin
    .from("article_audios")
    .select("*")
    .eq("article_id", article.id)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (!audioRecord) {
    return NextResponse.json({ status: "not_generated" });
  }

  return NextResponse.json({
    status: audioRecord.status,
    audio_url: audioRecord.audio_url,
    duration_seconds: audioRecord.duration_seconds,
    timing_data: audioRecord.timing_data,
    updated_at: audioRecord.updated_at,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: articleId } = await params;
  const admin = createSupabaseAdmin();
  const supabaseServer = await createSupabaseServer();

  // 1. Rate Limiting Check
  const rateLimitRes = await enforceRateLimit("articleAudioGenerate", req);
  if (rateLimitRes) return rateLimitRes;

  // 2. Fetch Article
  const { data: article } = await admin
    .from("articles")
    .select("id, title, excerpt, body, status, visibility, owner_id")
    .eq("id", articleId)
    .single();

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // 3. Auth Check
  const { data: { user } } = await supabaseServer.auth.getUser();
  const isRestricted = ["draft", "archived", "expired", "rejected"].includes(article.status) || article.visibility === "private";

  if (isRestricted) {
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (user.id !== article.owner_id) {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "admin" || profile?.status !== "active") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // 4. Extract Spoken Content & Compute Hash
  const spokenBlocks = extractSpokenBlocks(article);
  if (spokenBlocks.length === 0) {
    return NextResponse.json({ error: "No readable article content found" }, { status: 400 });
  }

  const contentHash = computeSpokenContentHash(spokenBlocks);

  // 5. Generation Lock / Idempotency Check (Correction 5)
  const { data: existingRecord } = await admin
    .from("article_audios")
    .select("*")
    .eq("article_id", article.id)
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (existingRecord) {
    if (existingRecord.status === "ready") {
      return NextResponse.json({
        status: "ready",
        audio_url: existingRecord.audio_url,
        duration_seconds: existingRecord.duration_seconds,
        timing_data: existingRecord.timing_data,
        cached: true,
      });
    }

    if (existingRecord.status === "generating") {
      const timeSinceUpdateMs = Date.now() - new Date(existingRecord.updated_at).getTime();
      // If locked less than 90s ago, return current generating status without duplicating job
      if (timeSinceUpdateMs < 90000) {
        return NextResponse.json({
          status: "generating",
          message: "TTS generation in progress",
        });
      }
    }
  }

  // 6. Acquire Generation Lock (status = 'generating')
  const storagePath = `article-audio/${article.id}/${contentHash}.wav`;

  const { error: lockErr } = await admin.from("article_audios").upsert(
    {
      article_id: article.id,
      content_hash: contentHash,
      audio_url: existingRecord?.audio_url || "",
      storage_path: storagePath,
      duration_seconds: existingRecord?.duration_seconds || 0,
      status: "generating",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id, content_hash" }
  );

  if (lockErr) {
    console.error("[API Audio] Error setting generation lock:", lockErr);
  }

  try {
    // 7. Chunk Spoken Content
    const chunks = chunkSpokenBlocks(spokenBlocks, 800);

    // 8. NVIDIA TTS Synthesis & Timing Assembly
    const synthesisResult = await generateFullArticleAudio(chunks);

    // 9. Upload Concatenated WAV Buffer to Supabase Storage
    const { error: uploadErr } = await admin.storage
      .from("article-audio")
      .upload(storagePath, synthesisResult.mergedAudioBuffer, {
        contentType: "audio/wav",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = admin.storage
      .from("article-audio")
      .getPublicUrl(storagePath);

    const durationSec = Math.max(1, Math.round((synthesisResult.timingData.durationMs / 1000) * 100) / 100);

    // 10. Save Complete Record with status = 'ready'
    const { data: updatedRecord, error: dbErr } = await admin
      .from("article_audios")
      .upsert(
        {
          article_id: article.id,
          content_hash: contentHash,
          audio_url: publicUrlData.publicUrl,
          storage_path: storagePath,
          duration_seconds: durationSec,
          status: "ready",
          timing_data: synthesisResult.timingData as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "article_id, content_hash" }
      )
      .select()
      .single();

    if (dbErr) {
      throw new Error(`DB update failed: ${dbErr.message}`);
    }

    return NextResponse.json({
      status: "ready",
      audio_url: updatedRecord.audio_url,
      duration_seconds: updatedRecord.duration_seconds,
      timing_data: updatedRecord.timing_data,
    });
  } catch (err: any) {
    console.error("[API Audio] Synthesis generation error:", err);

    await admin.from("article_audios").upsert(
      {
        article_id: article.id,
        content_hash: contentHash,
        status: "failed",
        error_message: err.message || String(err),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id, content_hash" }
    );

    return NextResponse.json(
      { error: "Audio synthesis failed", details: err.message },
      { status: 500 }
    );
  }
}
