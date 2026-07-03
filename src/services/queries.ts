import {
  queryOptions,
  UseSuspenseInfiniteQueryResult,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { getUser } from "./auth.api";

export const authQueries = {
  all: ["auth"],
  user: () =>
    queryOptions({
      queryKey: [...authQueries.all, "user"],
      queryFn: () => getUser(),
    }),
};

export const useAuthenticatedUser = () => {
  const authQuery = useSuspenseQuery(authQueries.user());

  if (authQuery.data.isAuthenticated === false) {
    throw new Error("User não esta autenticado!");
  }
  return authQuery as UseSuspenseInfiniteQueryResult<typeof authQuery.data>;
};
