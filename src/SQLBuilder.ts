import db from "./db";

type SQLAction = 'SELECT' | 'INSERT' | 'INSERT OR REPLACE';

export default class SQLBuilder {
  private readonly params: any[];
  private action: SQLAction | null;
  private columns: string[];
  private table: string;
  private readonly conditions: string[];
  private limitCount: number | null;
  private offsetCount: number | null;
  private readonly jsonColumns: Set<string>;
  private groupByColumn: string | null;
  private orderByColumn: string | null;

  constructor() {
    this.action = null;
    this.params = [];
    this.columns = [];
    this.table = "";
    this.conditions = [];
    this.limitCount = null;
    this.offsetCount = null;
    this.jsonColumns = new Set<string>([
      'breadcrumbs', 'keywords',
    ]);
    this.groupByColumn = null;
    this.orderByColumn = null;
  }

  select(columns: string[]): SQLBuilder {
    this.columns = columns;
    this.action = 'SELECT';
    return this;
  }

  insert(columns: string[], values: any[]): SQLBuilder {
    this.action = 'INSERT';
    this.columns = columns;
    this.params.push(...values);
    return this;
  }

  insertOrReplace(columns: string[], values: any[]): SQLBuilder {
    this.action = 'INSERT OR REPLACE';
    this.columns = columns;
    this.params.push(...values);
    return this;
  }

  from(table: string): SQLBuilder {
    this.table = table;
    return this;
  }

  into(table: string): SQLBuilder {
    this.table = table;
    return this;
  }

  where(condition: string, ...params: any[]): SQLBuilder {
    this.conditions.push(`WHERE ${condition}`);
    this.params.push(...params);
    return this;
  }

  and(condition: string, ...params: any[]): SQLBuilder {
    if (this.conditions.length === 0) {
      this.conditions.push(`WHERE ${condition}`);
    } else {
      this.conditions.push(`AND ${condition}`);
    }
    this.params.push(...params);
    return this;
  }

  or(condition: string, ...params: any[]): SQLBuilder {
    if (this.conditions.length === 0) {
      this.conditions.push(`WHERE ${condition}`);
    } else {
      this.conditions.push(`OR ${condition}`);
    }
    this.params.push(...params);
    return this;
  }

  limit(count: number): SQLBuilder {
    this.limitCount = count;
    return this;
  }

  offset(count: number): SQLBuilder {
    this.offsetCount = count;
    return this;
  }

  groupBy(column: string): SQLBuilder {
    this.groupByColumn = column;
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): SQLBuilder {
    if (!column.includes(' ')) column = `"${column}"`;
    this.orderByColumn = `${column} ${direction}`;
    return this;
  }

  raw(sql: string): SQLBuilder {
    this.conditions.push(sql);
    return this;
  }

  getParams(): any[] {
    return this.params;
  }

  run(): any {
    if (!this.action || !this.table || this.columns.length === 0)
      throw new Error('Incomplete SQL statement');
    const stmt = db.prepare(this.toString());
    if (this.action === 'SELECT') {
      const results = stmt.all(...this.getParams());
      return results.map((row: any) => {
        for (const col of this.jsonColumns) {
          if (row[col] && typeof row[col] === 'string') {
            try {
              row[col] = JSON.parse(row[col]);
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
        return row;
      });
    } else if (this.action === 'INSERT' || this.action === 'INSERT OR REPLACE') {
      return stmt.run(...this.getParams());
    }
  }

  toString(): string {
    let sql = '';
    const cols = this.columns.map(col => {
      if (col.includes(' ')) return col;
      return `"${col}"`;
    });
    if (this.action === 'SELECT') {
      sql = `${this.action} ${cols.join(',')} FROM "${this.table}"`;
    } else if (this.action === 'INSERT' || this.action === 'INSERT OR REPLACE') {
      sql = `${this.action} INTO "${this.table}" (${cols.join(',')}) VALUES (${this.columns.map(() => '?').join(',')})`;
    }
    if (!sql) throw new Error('Incomplete SQL statement');
    for (const condition of this.conditions) {
      sql += ` ${condition}`;
    }
    if (this.groupByColumn) {
      sql += ` GROUP BY ${this.groupByColumn}`;
    }
    if (this.orderByColumn) {
      sql += ` ORDER BY ${this.orderByColumn}`;
    }
    if (this.limitCount !== null) {
      sql += ` LIMIT ${this.limitCount}`;
    }
    if (this.offsetCount !== null) {
      sql += ` OFFSET ${this.offsetCount}`;
    }
    return sql.trim();
  }
}