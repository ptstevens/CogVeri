/**
 * Knowledge Base Article Registry
 *
 * Articles are stored as markdown files in ../content/ and imported via Vite's ?raw query.
 * To add a new article:
 * 1. Create a .md file in ../content/
 * 2. Import it below with ?raw
 * 3. Add to the articles array
 */

import { LucideIcon, BookOpen, Blocks, LayoutTemplate } from 'lucide-react';

// Markdown content loaded as raw strings at build time (no runtime fetch needed)
import gettingStartedContent from '../content/getting-started.md?raw';
import creatingRubricsContent from '../content/creating-rubrics.md?raw';
import creatingTemplatesContent from '../content/creating-templates.md?raw';

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
export const getSortedArticles = (): KBArticle[] => [...articles].sort((a, b) => a.order - b.order);
