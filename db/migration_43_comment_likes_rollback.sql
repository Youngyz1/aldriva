-- Rollback for migration 43: remove the comment-like feature.
-- Destructive — drops all real user likes (the comments.likes baseline is untouched).

drop function if exists public.get_comment_like_counts(uuid[]);
drop table if exists comment_likes;  -- cascades its indexes; comments rows unaffected

notify pgrst, 'reload schema';
