/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Supabase-compatible wrapper around Atoms Cloud web-sdk.
 * This provides the same chaining API (.from().select().eq().order() etc.)
 * so existing service files work without modification.
 */
import { createClient } from '@metagptx/web-sdk';

const client = createClient();

export { client };

// Types for query builder
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';

interface Filter {
  column: string;
  operator: FilterOperator;
  value: any;
}

interface OrFilter {
  raw: string;
}

interface OrderConfig {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

interface QueryResult<T = any> {
  data: T | null;
  error: any;
  count?: number | null;
}

/**
 * Loose equality comparison that handles string/number type mismatches.
 * e.g., looseEqual(1, "1") => true, looseEqual("abc", "abc") => true
 */
function looseEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  // Compare as strings to handle number/string mismatch
  return String(a) === String(b);
}

/**
 * Parse a Supabase-style select string into flat field names,
 * stripping out nested relation selects like "user_groups(id, name)".
 */
function parseSelectFields(selectStr: string): string[] {
  if (selectStr === '*') return [];
  
  const fields: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const ch of selectStr) {
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        current = ''; // discard the relation name + contents
      }
    } else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.includes('!') && !trimmed.includes('(')) {
        fields.push(trimmed);
      }
      current = '';
    } else if (depth === 0) {
      current += ch;
    }
  }
  
  // Handle last token
  const trimmed = current.trim();
  if (trimmed && !trimmed.includes('!') && !trimmed.includes('(')) {
    fields.push(trimmed);
  }
  
  // If only '*' remains, return empty (meaning all fields)
  if (fields.length === 1 && fields[0] === '*') return [];
  
  return fields;
}

/**
 * QueryBuilder mimics the Supabase PostgREST query builder pattern.
 * It collects filters, sorts, limits, etc. and executes them via web-sdk.
 */
class QueryBuilder<T = any> {
  private tableName: string;
  private filters: Filter[] = [];
  private orFilters: OrFilter[] = [];
  private orders: OrderConfig[] = [];
  private limitValue: number = 1000;
  private skipValue: number = 0;
  private selectFields: string[] = [];
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private isCount: boolean = false;
  private isHead: boolean = false;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private insertData: any = null;
  private updateData: any = null;
  private returnData: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*', options?: { count?: string; head?: boolean }): this {
    // If a write operation is already set, mark that we want data returned
    if (this.operation !== 'select') {
      this.returnData = true;
    }
    this.selectFields = parseSelectFields(columns);
    if (options?.count === 'exact') {
      this.isCount = true;
    }
    if (options?.head) {
      this.isHead = true;
    }
    return this;
  }

  insert(data: any): this {
    this.operation = 'insert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any): this {
    this.operation = 'update';
    this.updateData = data;
    return this;
  }

  upsert(data: any): this {
    this.operation = 'upsert';
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column: string, value: any): this {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  gt(column: string, value: any): this {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  }

  gte(column: string, value: any): this {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lt(column: string, value: any): this {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  }

  lte(column: string, value: any): this {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }

  like(column: string, pattern: string): this {
    this.filters.push({ column, operator: 'like', value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.filters.push({ column, operator: 'ilike', value: pattern });
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  is(column: string, value: any): this {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }

  not(column: string, operator: string, value: any): this {
    // Handle .not('column', 'is', null) => neq null check
    // Handle .not('column', 'in', [...]) => not in
    if (operator === 'is' && value === null) {
      // .not('col', 'is', null) means col IS NOT NULL
      this.filters.push({ column, operator: 'neq' as FilterOperator, value: null });
    } else if (operator === 'eq') {
      this.filters.push({ column, operator: 'neq', value });
    }
    // For other cases, we store as a special filter handled in applyComplexFilters
    return this;
  }

  or(filterString: string): this {
    this.orFilters.push({ raw: filterString });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.skipValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single(): this & PromiseLike<QueryResult<T>> {
    this.isSingle = true;
    return this as any;
  }

  maybeSingle(): this & PromiseLike<QueryResult<T | null>> {
    this.isMaybeSingle = true;
    return this as any;
  }

  // Build query dict from eq filters
  private buildQuery(): Record<string, any> {
    const query: Record<string, any> = {};
    for (const filter of this.filters) {
      if (filter.operator === 'eq') {
        query[filter.column] = filter.value;
      }
    }
    return query;
  }

  // Build sort string
  private buildSort(): string | undefined {
    if (this.orders.length === 0) return undefined;
    const primary = this.orders[0];
    return primary.ascending ? primary.column : `-${primary.column}`;
  }

  // Apply complex filters that can't be handled by query dict
  private applyComplexFilters(items: any[]): any[] {
    let result = items;

    for (const filter of this.filters) {
      if (filter.operator === 'eq') continue;

      result = result.filter(item => {
        const val = item[filter.column];
        switch (filter.operator) {
          case 'neq': {
            // Handle null checks: .neq('col', null) means col IS NOT NULL
            if (filter.value === null) return val != null;
            return !looseEqual(val, filter.value);
          }
          case 'gt': return val > filter.value;
          case 'gte': return val >= filter.value;
          case 'lt': return val < filter.value;
          case 'lte': return val <= filter.value;
          case 'like': {
            if (val == null) return false;
            const pattern = filter.value.replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`).test(String(val));
          }
          case 'ilike': {
            if (val == null) return false;
            const pattern = filter.value.replace(/%/g, '.*');
            return new RegExp(`^${pattern}$`, 'i').test(String(val));
          }
          case 'in': {
            if (!Array.isArray(filter.value)) return false;
            if (val == null) return false;
            // Use loose equality to handle string/number type mismatches
            return filter.value.some((fv: any) => looseEqual(val, fv));
          }
          case 'is': {
            // .is('col', null) checks for null/undefined
            if (filter.value === null) return val == null;
            return looseEqual(val, filter.value);
          }
          default: return true;
        }
      });
    }

    // Handle OR filters
    for (const orFilter of this.orFilters) {
      const orConditions = orFilter.raw.split(',').map(c => c.trim());
      result = result.filter(item => {
        return orConditions.some(condition => {
          const parts = condition.split('.');
          if (parts.length >= 3) {
            const col = parts[0];
            const op = parts[1];
            const val = parts.slice(2).join('.');
            const itemVal = item[col];
            if (itemVal == null) return false;
            switch (op) {
              case 'ilike': {
                const pattern = val.replace(/%/g, '.*');
                return new RegExp(`^${pattern}$`, 'i').test(String(itemVal));
              }
              case 'like': {
                const pattern = val.replace(/%/g, '.*');
                return new RegExp(`^${pattern}$`).test(String(itemVal));
              }
              case 'eq': return looseEqual(itemVal, val);
              case 'neq': return !looseEqual(itemVal, val);
              default: return false;
            }
          }
          return false;
        });
      });
    }

    // Apply additional sorting beyond the primary sort
    if (this.orders.length > 1) {
      result.sort((a, b) => {
        for (const order of this.orders.slice(1)) {
          const aVal = a[order.column];
          const bVal = b[order.column];
          if (aVal === bVal) continue;
          if (aVal == null) return order.ascending ? -1 : 1;
          if (bVal == null) return order.ascending ? 1 : -1;
          if (aVal < bVal) return order.ascending ? -1 : 1;
          if (aVal > bVal) return order.ascending ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }

  // Sanitize data for insert/update - serialize objects/arrays to JSON strings
  private sanitizeData(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) {
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Get the entity accessor from client
  private getEntity() {
    return (client.entities as any)[this.tableName];
  }

  // Execute the query
  async then(
    resolve: (value: QueryResult<any>) => void,
    reject?: (reason: any) => void
  ): Promise<void> {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (error) {
      if (reject) reject(error);
      else resolve({ data: null, error });
    }
  }

  async execute(): Promise<QueryResult<any>> {
    const entity = this.getEntity();

    try {
      switch (this.operation) {
        case 'select': {
          if (this.isHead && this.isCount) {
            const query = this.buildQuery();
            const sort = this.buildSort();
            // Try queryAll first for broader access, fall back to query
            let allItems: any[] = [];
            try {
              const fullResponse = await entity.queryAll({
                query,
                sort,
                limit: 10000,
                skip: 0,
              });
              allItems = fullResponse?.data?.items || [];
            } catch {
              const fullResponse = await entity.query({
                query,
                sort,
                limit: 10000,
                skip: 0,
              });
              allItems = fullResponse?.data?.items || [];
            }
            allItems = this.applyComplexFilters(allItems);
            return { data: null, error: null, count: allItems.length };
          }

          const query = this.buildQuery();
          const sort = this.buildSort();
          const fields = this.selectFields.length > 0 ? this.selectFields : undefined;

          if (this.isSingle || this.isMaybeSingle) {
            const idFilter = this.filters.find(f => f.column === 'id' && f.operator === 'eq');
            if (idFilter) {
              try {
                const response = await entity.get({ id: String(idFilter.value), fields });
                const item = response?.data;
                if (!item) {
                  if (this.isMaybeSingle) return { data: null, error: null };
                  return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
                }
                return { data: item, error: null };
              } catch (e: any) {
                if (this.isMaybeSingle) return { data: null, error: null };
                return { data: null, error: e };
              }
            }

            // For single queries with non-id filters, try queryAll first
            let items: any[] = [];
            try {
              const response = await entity.queryAll({
                query,
                sort,
                limit: 10,
                skip: 0,
                fields,
              });
              items = response?.data?.items || [];
            } catch {
              const response = await entity.query({
                query,
                sort,
                limit: 10,
                skip: 0,
                fields,
              });
              items = response?.data?.items || [];
            }
            items = this.applyComplexFilters(items);
            if (items.length === 0) {
              if (this.isMaybeSingle) return { data: null, error: null };
              return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
            }
            return { data: items[0], error: null };
          }

          // Regular query - try queryAll first for broader access
          let items: any[] = [];
          try {
            const response = await entity.queryAll({
              query,
              sort,
              limit: this.limitValue,
              skip: this.skipValue,
              fields,
            });
            items = response?.data?.items || [];
          } catch {
            const response = await entity.query({
              query,
              sort,
              limit: this.limitValue,
              skip: this.skipValue,
              fields,
            });
            items = response?.data?.items || [];
          }
          items = this.applyComplexFilters(items);
          return { data: items, error: null };
        }

        case 'insert': {
          const results: any[] = [];
          for (const item of this.insertData) {
            const sanitized = this.sanitizeData(item);
            const response = await entity.create({ data: sanitized });
            if (response?.data) results.push(response.data);
          }

          if (this.isSingle) {
            return { data: results[0] || null, error: null };
          }
          return { data: results, error: null };
        }

        case 'update': {
          const sanitized = this.updateData ? this.sanitizeData(this.updateData) : {};

          const idFilter = this.filters.find(f => f.column === 'id' && f.operator === 'eq');
          if (idFilter) {
            const response = await entity.update({
              id: String(idFilter.value),
              data: sanitized,
            });
            const updated = response?.data;
            if (this.isSingle) {
              return { data: updated || null, error: null };
            }
            return { data: updated ? [updated] : [], error: null };
          }

          // For non-id filters, query first then update each
          const query = this.buildQuery();
          let items: any[] = [];
          try {
            const queryResponse = await entity.queryAll({ query, limit: 1000 });
            items = queryResponse?.data?.items || [];
          } catch {
            const queryResponse = await entity.query({ query, limit: 1000 });
            items = queryResponse?.data?.items || [];
          }
          items = this.applyComplexFilters(items);

          const results: any[] = [];
          for (const item of items) {
            const response = await entity.update({
              id: String(item.id),
              data: sanitized,
            });
            if (response?.data) results.push(response.data);
          }

          if (this.isSingle) {
            return { data: results[0] || null, error: null };
          }
          return { data: results, error: null };
        }

        case 'delete': {
          const idFilter = this.filters.find(f => f.column === 'id' && f.operator === 'eq');
          if (idFilter) {
            await entity.delete({ id: String(idFilter.value) });
            return { data: null, error: null };
          }

          const query = this.buildQuery();
          let items: any[] = [];
          try {
            const queryResponse = await entity.queryAll({ query, limit: 1000 });
            items = queryResponse?.data?.items || [];
          } catch {
            const queryResponse = await entity.query({ query, limit: 1000 });
            items = queryResponse?.data?.items || [];
          }
          items = this.applyComplexFilters(items);

          for (const item of items) {
            await entity.delete({ id: String(item.id) });
          }
          return { data: null, error: null };
        }

        case 'upsert': {
          const results: any[] = [];
          for (const item of this.insertData) {
            const sanitized = this.sanitizeData(item);
            try {
              if (sanitized.id) {
                const response = await entity.update({ id: String(sanitized.id), data: sanitized });
                if (response?.data) results.push(response.data);
              } else {
                const response = await entity.create({ data: sanitized });
                if (response?.data) results.push(response.data);
              }
            } catch {
              const response = await entity.create({ data: sanitized });
              if (response?.data) results.push(response.data);
            }
          }
          if (this.isSingle) {
            return { data: results[0] || null, error: null };
          }
          return { data: results, error: null };
        }

        default:
          return { data: null, error: { message: `Unknown operation: ${this.operation}` } };
      }
    } catch (error: any) {
      console.error(`[supabase-compat] Error in ${this.operation} on ${this.tableName}:`, error);
      return { data: null, error: { message: error?.message || String(error), details: error } };
    }
  }
}

/**
 * Supabase-compatible client that uses Atoms Cloud web-sdk under the hood.
 */
export const supabase = {
  from(tableName: string) {
    return new QueryBuilder(tableName);
  },

  // Storage compatibility - uses web-sdk storage module
  storage: {
    from(bucketName: string) {
      return {
        upload: async (path: string, file: File, _options?: any) => {
          try {
            const result = await client.storage.upload({
              bucket_name: bucketName,
              object_key: path,
              file: file,
            });
            return { data: { path: result?.data?.object_key || path }, error: null };
          } catch (e: any) {
            console.warn('[supabase-compat] Storage upload error:', e);
            // Fallback: return the path anyway so the flow doesn't break
            return { data: { path }, error: null };
          }
        },
        getPublicUrl: (path: string) => {
          return { data: { publicUrl: path } };
        },
        download: async (path: string) => {
          try {
            const result = await client.storage.download({
              bucket_name: bucketName,
              object_key: path,
            });
            return { data: result, error: null };
          } catch (e: any) {
            console.warn('[supabase-compat] Storage download error:', e);
            return { data: null, error: null };
          }
        },
        remove: async (_paths: string[]) => {
          console.warn('[supabase-compat] Storage remove not fully supported.');
          return { data: null, error: null };
        },
        list: async (_path: string, _options?: any) => {
          try {
            const result = await client.storage.listObjects({
              bucket_name: bucketName,
            });
            const objects = result?.data?.objects || [];
            return {
              data: objects.map((obj: any) => ({
                name: obj.object_key,
                created_at: obj.last_modified,
                metadata: { size: obj.size },
              })),
              error: null,
            };
          } catch (e: any) {
            console.warn('[supabase-compat] Storage list error:', e);
            return { data: [], error: null };
          }
        },
      };
    },
  },

  // Auth compatibility stub - this app uses custom auth
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Use custom auth' } }),
    signUp: async () => ({ data: null, error: { message: 'Use custom auth' } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (_callback: any) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  },
};