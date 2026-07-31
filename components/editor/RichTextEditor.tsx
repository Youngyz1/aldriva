"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Node } from "@tiptap/core";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage, UploadImageError } from "@/lib/uploadImage";
import { ALLOWED_IMAGE_TYPES } from "@/lib/imageCompression";
import DOMPurify from "isomorphic-dompurify";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Link as LinkIcon,
  ImagePlus as UploadImageIcon,
  Globe as LinkImageIcon,
  Video as UploadVideoIcon,
  Tv as LinkVideoIcon,
  Undo2 as UndoIcon,
  Redo2 as RedoIcon,
  Unlink as UnlinkIcon,
} from "lucide-react";

// --- Custom Video Node Extension ---
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (options: { src: string }) => ReturnType;
    };
  }
}

const VideoExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "video",
      },
      {
        tag: "iframe[src]",
        getAttrs: (node) => {
          const src = (node as HTMLElement).getAttribute("src");
          if (!src) return false;
          return { src };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src || "";
    const isYoutube = src.includes("youtube.com") || src.includes("youtu.be");
    const isVimeo = src.includes("vimeo.com");

    if (isYoutube || isVimeo) {
      let embedUrl = src;
      if (isYoutube) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = src.match(regExp);
        if (match && match[2].length === 11) {
          embedUrl = `https://www.youtube.com/embed/${match[2]}`;
        }
      } else if (isVimeo) {
        const regExp = /vimeo\.com\/([0-9]+)/;
        const match = src.match(regExp);
        if (match && match[1]) {
          embedUrl = `https://player.vimeo.com/video/${match[1]}`;
        }
      }
      return [
        "div",
        { class: "video-wrapper aspect-video w-full my-4" },
        [
          "iframe",
          {
            src: embedUrl,
            frameborder: "0",
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowfullscreen: "true",
            class: "w-full h-full rounded-xl",
          },
        ],
      ];
    }

    return [
      "video",
      {
        src,
        controls: "true",
        class: "w-full max-h-[450px] rounded-xl my-4 bg-black",
      },
    ];
  },

  addCommands() {
    return {
      setVideo:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

// --- Validation Constants & Helpers ---
// Image size/type limits now live in lib/imageCompression.ts (single source
// of truth, shared with every other image upload in the app). Video limits
// are unaffected — video compression is a separate, future task.
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

const validateImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".png") ||
      path.endsWith(".webp") ||
      path.endsWith(".gif") ||
      path.endsWith(".avif")
    );
  } catch {
    return false;
  }
};

const validateVideoUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (host.includes("youtube.com") || host.includes("youtu.be")) return true;
    if (host.includes("vimeo.com")) return true;
    if (path.endsWith(".mp4") || path.endsWith(".webm") || path.endsWith(".ogg")) return true;

    return false;
  } catch {
    return false;
  }
};

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accent?: "green" | "orange";
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing here...",
  accent = "green",
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [modalType, setModalType] = useState<"image" | "video" | "link" | null>(null);
  const [modalInput, setModalInput] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-xl max-w-full my-4",
        },
      }),
      VideoExtension,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap-editor outline-none px-5 py-4 min-h-[250px] max-h-[600px] overflow-y-auto",
        placeholder,
      },
      transformPastedHTML(html) {
        return DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            "p",
            "br",
            "strong",
            "em",
            "u",
            "h1",
            "h2",
            "h3",
            "ul",
            "ol",
            "li",
            "blockquote",
            "a",
            "img",
            "video",
            "source",
          ],
          ALLOWED_ATTR: ["src", "href", "target", "rel", "controls", "width", "height", "alt"],
        });
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  // --- Actions ---
  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    setModalInput(previousUrl || "");
    setModalType("link");
  };

  const handleLinkSubmit = () => {
    if (modalInput === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: modalInput }).run();
    }
    setModalType(null);
    setModalInput("");
  };

  const handleImageUrlSubmit = () => {
    if (modalInput && validateImageUrl(modalInput)) {
      editor.chain().focus().setImage({ src: modalInput }).run();
      setModalType(null);
      setModalInput("");
    } else {
      alert("Invalid image URL. Must end with .jpg, .jpeg, .png, .webp, .gif, or .avif");
    }
  };

  const handleVideoUrlSubmit = () => {
    if (modalInput && validateVideoUrl(modalInput)) {
      editor.chain().focus().setVideo({ src: modalInput }).run();
      setModalType(null);
      setModalInput("");
    } else {
      alert("Invalid video URL. Supported: YouTube, Vimeo, or direct mp4/webm/ogg links");
    }
  };

  const handleImageUploadClick = () => {
    imageInputRef.current?.click();
  };

  const handleVideoUploadClick = () => {
    videoInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const url = await uploadImage(file, "fundraiser-media", "editor-images");
      editor.chain().focus().setImage({ src: url }).run();
    } catch (error: unknown) {
      const message = error instanceof UploadImageError ? error.message : "Upload failed. Please try again.";
      alert(message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE) {
      alert("Video exceeds 50MB size limit.");
      return;
    }

    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      alert("Unsupported video type. Use MP4, WEBM, OGG, or QuickTime.");
      return;
    }

    try {
      setUploading(true);
      const ext = file.name.split(".").pop();
      const fileName = `editor-videos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

      // Choose bucket based on theme (fundraiser videos -> "videos", event videos -> "event-videos")
      const bucketName = accent === "green" ? "videos" : "event-videos";

      const { error: uploadError } = await supabase.storage.from(bucketName).upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      editor.chain().focus().setVideo({ src: urlData.publicUrl }).run();
    } catch (error: unknown) {
      alert("Upload failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // --- Toolbar Styling Helpers ---
  const activeClass =
    accent === "green"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : "bg-orange-100 text-orange-800 border-orange-200";

  const buttonStyle = (isActive: boolean) =>
    `p-2.5 rounded-lg border text-sm font-semibold transition hover:bg-zinc-100 flex items-center justify-center ${
      isActive ? activeClass : "bg-white border-zinc-200 text-zinc-700"
    }`;

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      {/* Hidden file inputs for uploads */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
      />
      <input
        type="file"
        ref={videoInputRef}
        onChange={handleVideoFileChange}
        accept={ALLOWED_VIDEO_TYPES.join(",")}
        className="hidden"
      />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 bg-zinc-50/50 p-2.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={buttonStyle(editor.isActive("bold"))}
          title="Bold"
        >
          <BoldIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={buttonStyle(editor.isActive("italic"))}
          title="Italic"
        >
          <ItalicIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={buttonStyle(editor.isActive("underline"))}
          title="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>

        <span className="w-px h-6 bg-zinc-200 mx-1 align-self-center self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={buttonStyle(editor.isActive("heading", { level: 1 }))}
          title="Heading 1"
        >
          <span className="text-xs font-bold leading-none">H1</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={buttonStyle(editor.isActive("heading", { level: 2 }))}
          title="Heading 2"
        >
          <span className="text-xs font-bold leading-none">H2</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={buttonStyle(editor.isActive("heading", { level: 3 }))}
          title="Heading 3"
        >
          <span className="text-xs font-bold leading-none">H3</span>
        </button>

        <span className="w-px h-6 bg-zinc-200 mx-1 align-self-center self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={buttonStyle(editor.isActive("bulletList"))}
          title="Bullet List"
        >
          <ListIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={buttonStyle(editor.isActive("orderedList"))}
          title="Numbered List"
        >
          <ListOrderedIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={buttonStyle(editor.isActive("blockquote"))}
          title="Blockquote"
        >
          <span className="text-xs font-bold leading-none">“</span>
        </button>

        <span className="w-px h-6 bg-zinc-200 mx-1 align-self-center self-center" />

        <button
          type="button"
          onClick={setLink}
          className={buttonStyle(editor.isActive("link"))}
          title="Link"
        >
          <LinkIcon className="h-4 w-4" />
        </button>
        {editor.isActive("link") && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className={buttonStyle(false)}
            title="Remove Link"
          >
            <UnlinkIcon className="h-4 w-4" />
          </button>
        )}

        <span className="w-px h-6 bg-zinc-200 mx-1 align-self-center self-center" />

        <button
          type="button"
          onClick={handleImageUploadClick}
          className={buttonStyle(false)}
          title="Upload Image"
          disabled={uploading}
        >
          <UploadImageIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setModalType("image")}
          className={buttonStyle(false)}
          title="Insert Image URL"
        >
          <LinkImageIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleVideoUploadClick}
          className={buttonStyle(false)}
          title="Upload Video"
          disabled={uploading}
        >
          <UploadVideoIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setModalType("video")}
          className={buttonStyle(false)}
          title="Insert Video URL"
        >
          <LinkVideoIcon className="h-4 w-4" />
        </button>

        <span className="w-px h-6 bg-zinc-200 mx-1 align-self-center self-center" />

        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={buttonStyle(false) + " disabled:opacity-50"}
          title="Undo"
        >
          <UndoIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={buttonStyle(false) + " disabled:opacity-50"}
          title="Redo"
        >
          <RedoIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Editor Content Area */}
      <div className="relative">
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
            <span className="text-sm font-bold text-zinc-500 flex items-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-zinc-500 border-t-transparent rounded-full" />
              Uploading media...
            </span>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Popovers / Modals */}
      {modalType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-zinc-100">
            <h3 className="text-lg font-black text-zinc-900 mb-2">
              {modalType === "link"
                ? "Insert Link"
                : modalType === "image"
                ? "Insert Image URL"
                : "Insert Video URL"}
            </h3>
            <p className="text-sm font-medium text-zinc-500 mb-4">
              {modalType === "link"
                ? "Enter the destination URL for the link:"
                : modalType === "image"
                ? "Enter the absolute URL of the image:"
                : "Enter YouTube, Vimeo, or direct MP4 video URL:"}
            </p>
            <input
              type="text"
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-zinc-400 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (modalType === "link") handleLinkSubmit();
                  else if (modalType === "image") handleImageUrlSubmit();
                  else if (modalType === "video") handleVideoUrlSubmit();
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setModalInput("");
                }}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-sm font-black text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (modalType === "link") handleLinkSubmit();
                  else if (modalType === "image") handleImageUrlSubmit();
                  else if (modalType === "video") handleVideoUrlSubmit();
                }}
                className={`px-4 py-2.5 rounded-xl text-sm font-black text-white ${
                  accent === "green"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-orange-600 hover:bg-orange-700"
                }`}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
