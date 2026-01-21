/**
 * Knowledge Base Page
 *
 * Main knowledge base page with two views:
 * 1. Index view - Grid of article cards
 * 2. Article view - Full article content with sidebar navigation
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, ArrowLeft } from 'lucide-react';
import Card from '../../components/ui/Card';
import { RichTextContent } from '../../components/ui/RichTextEditor';
import { getArticleBySlug, getSortedArticles, KBArticle } from './articles';
import ArticleSidebar from './components/ArticleSidebar';

// ============================================================
// Index View - Grid of Article Cards
// ============================================================

const KnowledgeBaseIndex: React.FC = () => {
  const navigate = useNavigate();
  const sortedArticles = getSortedArticles();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary-100 rounded-lg">
            <BookOpen className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Knowledge Base</h1>
        </div>
        <p className="text-gray-600 ml-14">
          Learn how to get the most out of CogVeri with guides and tutorials.
        </p>
      </div>

      {/* Article Cards */}
      <div className="grid gap-4">
        {sortedArticles.map((article) => {
          const Icon = article.icon;

          return (
            <Card
              key={article.slug}
              hoverable
              onClick={() => navigate(`/knowledge-base/${article.slug}`)}
              className="p-5 cursor-pointer transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary-50 rounded-xl flex-shrink-0">
                  <Icon className="h-6 w-6 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900">{article.title}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{article.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Article Not Found View
// ============================================================

const ArticleNotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Article Not Found</h2>
        <p className="text-gray-500 mb-6">
          The article you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/knowledge-base')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Knowledge Base
        </button>
      </div>
    </div>
  );
};

// ============================================================
// Article View - Full Content with Sidebar
// ============================================================

interface ArticleViewProps {
  article: KBArticle;
}

const ArticleView: React.FC<ArticleViewProps> = ({ article }) => {
  const navigate = useNavigate();
  const Icon = article.icon;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Sidebar Navigation */}
        <ArticleSidebar
          currentSlug={article.slug}
          onSelect={(slug) => navigate(`/knowledge-base/${slug}`)}
          onBackToIndex={() => navigate('/knowledge-base')}
        />

        {/* Article Content */}
        <div className="flex-1 min-w-0">
          {/* Mobile Back Button */}
          <button
            onClick={() => navigate('/knowledge-base')}
            className="lg:hidden flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All Articles
          </button>

          <Card className="p-6 sm:p-8">
            {/* Article Header */}
            <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-200">
              <div className="p-3 bg-primary-100 rounded-xl flex-shrink-0">
                <Icon className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  {article.title}
                </h1>
                <p className="text-gray-500 mt-1">{article.description}</p>
              </div>
            </div>

            {/* Article Body */}
            <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline prose-code:text-primary-700 prose-code:bg-primary-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
              <RichTextContent content={article.content} />
            </div>
          </Card>

          {/* Article Navigation */}
          <ArticleNavigation currentSlug={article.slug} />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Article Navigation - Previous/Next Links
// ============================================================

interface ArticleNavigationProps {
  currentSlug: string;
}

const ArticleNavigation: React.FC<ArticleNavigationProps> = ({ currentSlug }) => {
  const navigate = useNavigate();
  const sortedArticles = getSortedArticles();
  const currentIndex = sortedArticles.findIndex((a) => a.slug === currentSlug);

  const prevArticle = currentIndex > 0 ? sortedArticles[currentIndex - 1] : null;
  const nextArticle =
    currentIndex < sortedArticles.length - 1 ? sortedArticles[currentIndex + 1] : null;

  if (!prevArticle && !nextArticle) return null;

  return (
    <div className="mt-6 flex gap-4">
      {prevArticle && (
        <button
          onClick={() => navigate(`/knowledge-base/${prevArticle.slug}`)}
          className="flex-1 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-left group"
        >
          <div className="text-xs text-gray-400 mb-1">Previous</div>
          <div className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
            {prevArticle.title}
          </div>
        </button>
      )}
      {nextArticle && (
        <button
          onClick={() => navigate(`/knowledge-base/${nextArticle.slug}`)}
          className="flex-1 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-right group"
        >
          <div className="text-xs text-gray-400 mb-1">Next</div>
          <div className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
            {nextArticle.title}
          </div>
        </button>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

const KnowledgeBase: React.FC = () => {
  const { articleSlug } = useParams<{ articleSlug?: string }>();

  // Index view - no slug
  if (!articleSlug) {
    return <KnowledgeBaseIndex />;
  }

  // Article view - with slug
  const article = getArticleBySlug(articleSlug);

  if (!article) {
    return <ArticleNotFound />;
  }

  return <ArticleView article={article} />;
};

export default KnowledgeBase;
