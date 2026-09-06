export const DEFAULT_PROJECT_ID = "my-design";
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function resolveProjectId(
  search: string,
  pathname = "",
): string {
  const queryProjectId = new URLSearchParams(search).get("project");
  if (queryProjectId && PROJECT_ID_PATTERN.test(queryProjectId)) {
    return queryProjectId;
  }

  const pathProjectId = pathname.split("/").filter(Boolean)[0];
  return pathProjectId && PROJECT_ID_PATTERN.test(pathProjectId)
    ? pathProjectId
    : DEFAULT_PROJECT_ID;
}
