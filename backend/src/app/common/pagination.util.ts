export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    totalItems: number;
    itemCount: number;
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
  };
  links: {
    first: string;
    previous: string | null;
    next: string | null;
    last: string;
  };
}

export function paginate<T>(
  data: T[],
  totalItems: number,
  currentPage: number,
  itemsPerPage: number,
  path: string,
  extraQueryParams: Record<string, any> = {},
): PaginatedResponse<T> {
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const page = currentPage < 1 ? 1 : currentPage;

  const getUrl = (p: number) => {
    const query = new URL(path, 'http://localhost'); // dummy base to parse URL relative path
    query.searchParams.set('page', p.toString());
    query.searchParams.set('limit', itemsPerPage.toString());
    for (const [key, value] of Object.entries(extraQueryParams)) {
      if (value !== undefined && value !== null) {
        query.searchParams.set(key, value.toString());
      }
    }
    return `${query.pathname}${query.search}`;
  };

  return {
    data,
    meta: {
      totalItems,
      itemCount: data.length,
      itemsPerPage,
      totalPages,
      currentPage: page,
    },
    links: {
      first: getUrl(1),
      previous: page > 1 ? getUrl(page - 1) : null,
      next: page < totalPages ? getUrl(page + 1) : null,
      last: getUrl(totalPages),
    },
  };
}
