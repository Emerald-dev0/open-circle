import { useEffect, useState } from "react";

export function useForumSearch(params: URLSearchParams): URLSearchParams {
  const value = params.get("search") ?? "";
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  const query = new URLSearchParams(params);
  if (search) query.set("search", search); else query.delete("search");
  return query;
}
