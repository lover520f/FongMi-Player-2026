import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'span',
  'div',
  'img',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'hr',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'width', 'height', 'target', 'rel'];

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
};
