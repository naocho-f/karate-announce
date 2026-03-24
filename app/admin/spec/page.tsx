import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

export default function SpecPage() {
  const content = fs.readFileSync(path.join(process.cwd(), "SPEC.md"), "utf-8");

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-200 transition">← 管理画面に戻る</Link>
        </div>
        <div className="prose prose-invert prose-sm max-w-none
          prose-headings:font-bold prose-headings:text-white
          prose-h1:text-2xl prose-h1:mb-4 prose-h1:pb-3 prose-h1:border-b prose-h1:border-gray-700
          prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-gray-100
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2 prose-h3:text-gray-200
          prose-p:text-gray-300 prose-p:leading-relaxed
          prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-white
          prose-code:text-blue-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
          prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-lg
          prose-blockquote:border-l-gray-600 prose-blockquote:text-gray-400
          prose-li:text-gray-300
          prose-table:text-sm
          prose-thead:text-gray-300
          prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-700 prose-th:bg-gray-800
          prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-700
          prose-hr:border-gray-700
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </main>
  );
}
