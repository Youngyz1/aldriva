"use client";

interface ArticleRowActionsProps {
  articleId: string;
  onDelete: (formData: FormData) => Promise<void>;
}

export default function ArticleRowActions({
  articleId,
  onDelete,
}: ArticleRowActionsProps) {
  return (
    <form
      action={onDelete}
      onSubmit={(e) => {
        if (!confirm("Are you sure you want to delete this article?")) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={articleId} />
      <button
        type="submit"
        className="text-sm font-bold text-red-600 hover:text-red-700 pointer-events-auto cursor-pointer"
      >
        Delete
      </button>
    </form>
  );
}
