import { Database } from 'bun:sqlite';
import SQLBuilder from "./SQLBuilder";
import {htmlEscape} from "./utils";

const db = new Database('crawler.db');
const limitPerPage = 100;

export function getAllCrawledUrls(): string[] {
  const stmt = db.prepare('SELECT url FROM pages');
  return stmt.all().map((row: any) => row.url);
}

export function getSearchResults(query: string, page: number): {
  results: {
    url: string;
    title: string;
    description: string | null;
    keywords: string | null;
  }[];
  queryWithFilters: string;
  queryWithoutFilters: string;
} {
  let sql = new SQLBuilder().select([
    'url', 'title', 'description', 'author', 'favicon', 'date_published', 'site_name', 'breadcrumbs',
  ]).from('pages').limit(limitPerPage).offset((page - 1) * limitPerPage);
  let queryWithoutFilters = query;
  const siteFilter = query.match(/site:(\S+)/);
  if (siteFilter) {
    sql = sql.or('("url" LIKE ?', `http://${siteFilter[1]}%`);
    sql = sql.or('"url" LIKE ?', `https://${siteFilter[1]}%`);
    sql = sql.raw(')');
    queryWithoutFilters = query.replace(siteFilter[0], '').trim();
  }
  const langFilter = query.match(/lang:(\S+)/);
  if (langFilter) {
    sql = sql.or('"language" = ?', langFilter[1]);
    queryWithoutFilters = query.replace(langFilter[0], '').trim();
  }
  if (queryWithoutFilters) {
    sql = sql
      .and('("title" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"description" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"keywords" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"author" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"url" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .raw(')');
  }

  const results = sql.run() as unknown as any[];
  return {
    results: results.map((row: any) => ({
      ...row,
      description: row.description ? htmlEscape(row.description) : null,
    })),
    queryWithFilters: query,
    queryWithoutFilters: queryWithoutFilters.trim(),
  }
}

export function countResults(query: string): {
  results: number;
  pages: number;
} {
  let sql = new SQLBuilder().select(['COUNT(url) as count']).from('pages');
  const siteFilter = query.match(/site:(\S+)/);
  if (siteFilter) {
    sql = sql.or('("url" LIKE ?', `http://${siteFilter[1]}%`);
    sql = sql.or('"url" LIKE ?', `https://${siteFilter[1]}%`);
    sql = sql.raw(')');
  }
  const langFilter = query.match(/lang:(\S+)/);
  if (langFilter) {
    sql = sql.or('"language" = ?', langFilter[1]);
  }
  const queryWithoutFilters = query.replace(/site:(\S+)/, '').replace(/lang:(\S+)/, '').trim();
  if (queryWithoutFilters) {
    sql = sql
      .and('("title" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"description" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"keywords" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"author" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .or('"url" LIKE ?', `%${query.replaceAll(/\s+/g, '%')}%`)
      .raw(')');
  }
  const result = sql.run() as unknown as { count: number }[];
  const results = result[0].count || 0;

  return {
    results,
    pages: Math.ceil(results / limitPerPage),
  };
}

export function getStats(): {
  totalPages: number;
  languages: { language: string; count: number }[];
  authors: { author: string; count: number }[];
  hostnames: { hostname: string; count: number }[];
} {
  const totalPagesStmt = new SQLBuilder().select(['COUNT(url) as count']).from('pages');
  const totalPagesResult = totalPagesStmt.run() as unknown as { count: number }[];
  const totalPages = totalPagesResult[0].count || 0;

  const languagesStmt = new SQLBuilder().select(['language', 'COUNT(language) as count']).from('pages').where('language IS NOT NULL').groupBy('language').orderBy('count', 'DESC');
  const languages = languagesStmt.run() as unknown as { language: string; count: number }[];

  const authorsStmt = new SQLBuilder().select(['author', 'COUNT(author) as count']).from('pages').where('author IS NOT NULL').groupBy('author').orderBy('count', 'DESC');
  const authors = authorsStmt.run() as unknown as { author: string; count: number }[];

  const hostnamesStmt = new SQLBuilder().select(['SUBSTR(url, INSTR(url, "://") + 3, INSTR(SUBSTR(url, INSTR(url, "://") + 3), "/") - 1) as hostname', 'COUNT(*) as count']).from('pages').groupBy('hostname').orderBy('count', 'DESC');
  const hostnames = hostnamesStmt.run() as unknown as { hostname: string; count: number }[];

  return {
    totalPages,
    languages,
    authors,
    hostnames,
  }
}

export default db;