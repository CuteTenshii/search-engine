import { Database } from 'bun:sqlite';
import SQLBuilder from "./SQLBuilder";
import {htmlEscape} from "./utils";

const db = new Database('crawler.db');

export function getAllCrawledUrls(): string[] {
  const stmt = db.prepare('SELECT url FROM pages');
  return stmt.all().map((row: any) => row.url);
}

export function getSearchResults(query: string): {
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
  ]).from('pages').limit(100);
  const siteFilter = query.match(/site:(\S+)/);
  if (siteFilter) {
    sql = sql.or('"url" LIKE ?', `%${siteFilter[1]}%`);
    query = query.replace(siteFilter[0], '').trim();
  }
  const langFilter = query.match(/lang:(\S+)/);
  if (langFilter) {
    sql = sql.or('"language" = ?', langFilter[1]);
    query = query.replace(langFilter[0], '').trim();
  }
  if (query) {
    sql = sql
      .and('("title" LIKE ?', `%${query}%`)
      .or('"description" LIKE ?', `%${query}%`)
      .or('"keywords" LIKE ?', `%${query}%`)
      .or('"author" LIKE ?', `%${query}%`)
      .raw(')');
  }

  const results = sql.run() as unknown as any[];
  return {
    results: results.map((row: any) => ({
      ...row,
      description: row.description ? htmlEscape(row.description) : null,
    })),
    queryWithFilters: query,
    queryWithoutFilters: query.replace(/site:(\S+)/, '').replace(/lang:(\S+)/, '').trim(),
  }
}

export default db;