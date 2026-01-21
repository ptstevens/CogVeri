/**
 * Knowledge Base Article Registry
 *
 * Central registry for all knowledge base articles.
 * To add a new article:
 * 1. Create a content file (e.g., my-article.ts)
 * 2. Import the content here
 * 3. Add to the articles array
 */

import { LucideIcon, BookOpen, Blocks, LayoutTemplate } from 'lucide-react';
import { gettingStartedContent } from './getting-started';
import { creatingRubricsContent } from './creating-rubrics';
import { creatingTemplatesContent } from './creating-templates';

export interface KBArticle {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  content: string;
  order: number;
}

export const articles: KBArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started with CogVeri',
    description: 'Introduction to CogVeri and its core concepts',
    icon: BookOpen,
    content: gettingStartedContent,
    order: 1,
  },
  {
    slug: 'creating-rubrics',
    title: 'Creating Rubrics',
    description: 'How to build effective evaluation rubrics',
    icon: Blocks,
    content: creatingRubricsContent,
    order: 2,
  },
  {
    slug: 'creating-templates',
    title: 'Creating Templates',
    description: 'How to create and manage task templates',
    icon: LayoutTemplate,
    content: creatingTemplatesContent,
    order: 3,
  },
];

/**
 * Get an article by its slug
 */
export const getArticleBySlug = (slug: string): KBArticle | undefined =>
  articles.find((a) => a.slug === slug);

/**
 * Get articles sorted by order
 */
export const getSortedArticles = (): KBArticle[] =>
  [...articles].sort((a, b) => a.order - b.order);
