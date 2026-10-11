/**
 * ArticleSidebar Component
 *
 * Navigation sidebar for knowledge base articles.
 * Shows a list of all articles with the current one highlighted.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getSortedArticles } from '../articles';

interface ArticleSidebarProps {
  currentSlug: string;
  onSelect: (slug: string) => void;
  onBackToIndex: () => void;
}

const ArticleSidebar: React.FC<ArticleSidebarProps> = ({
  currentSlug,
  onSelect,
  onBackToIndex,
}) => {
  const sortedArticles = getSortedArticles();

  return (
    <nav className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-6">
        {/* Back to Index Link */}
        <button
          onClick={onBackToIndex}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All Articles
        </button>

        {/* Article List */}
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Articles
        </h2>
        <ul className="space-y-1">
          {sortedArticles.map((article) => {
            const isActive = article.slug === currentSlug;
            const Icon = article.icon;

            return (
              <li key={article.slug}>
                <button
                  onClick={() => onSelect(article.slug)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      isActive ? 'text-primary-600' : 'text-gray-400'
                    }`}
                  />
                  <span className="truncate">{article.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
};

export default ArticleSidebar;
