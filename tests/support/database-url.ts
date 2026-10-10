/** A URL-level search_path overrides pg's separate options setting. Isolated test
 * schemas must remove only that inherited setting, retaining TLS/other parameters. */
export function isolatedTestConnectionString(){
 const value=process.env.TEST_DATABASE_URL;if(!value)return undefined;
 const url=new URL(value);url.searchParams.delete('options');return url.toString();
}
