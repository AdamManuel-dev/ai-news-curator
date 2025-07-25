export interface DatabaseModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentModel extends DatabaseModel {
  url: string;
  title: string;
  summary: string;
  author: string;
  source: string;
  publishDate: Date;
  contentType: 'article' | 'paper' | 'tutorial' | 'news';
  qualityScore: number;
  tags: string[];
  embedding?: number[];
}
