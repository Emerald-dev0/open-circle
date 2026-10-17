import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { defaultUrlTransform } from "react-markdown";
import "./forum.css";

export function ForumBody({ children }: { children: string }) {
  return <div className="forum-body"><Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => /^(?:https?:\/\/|\/[^/]|#)/i.test(url) ? defaultUrlTransform(url) : ""} components={{ img: () => null, a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">{children}</a> : <span>{children}</span> }}>{children}</Markdown></div>;
}
export function ForumTime({ at }: { at: number }) {
  return <time dateTime={new Date(at).toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(at)}</time>;
}
