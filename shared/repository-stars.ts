export interface RepositoryStar {
  id: string;
  starred: boolean;
  stars: number;
}

export interface RepositoryStars {
  connected: boolean;
  repositories: RepositoryStar[];
}

export interface RepositoryStarInput {
  repositoryId: string;
  active: boolean;
}
