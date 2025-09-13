export default class SQLBuilder {
  private readonly params: any[];
  private columns: string[];
  private table: string;
  private readonly conditions: string[];
  private limitCount: number | null;

  constructor() {
    this.params = [];
    this.columns = [];
    this.table = "";
    this.conditions = [];
    this.limitCount = null;
  }

  select(columns: string[]): SQLBuilder {
    this.columns = columns;
    return this;
  }

  from(table: string): SQLBuilder {
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

  raw(sql: string): SQLBuilder {
    this.conditions.push(sql);
    return this;
  }

  getParams(): any[] {
    return this.params;
  }

  toString(): string {
    let sql = `SELECT "${this.columns.join('","')}" FROM "${this.table}"`;
    for (const condition of this.conditions) {
      sql += ` ${condition}`;
    }
    if (this.limitCount !== null) {
      sql += ` LIMIT ${this.limitCount}`;
    }
    return sql.trim();
  }
}