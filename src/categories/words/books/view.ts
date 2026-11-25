/** Ebook viewer: EPUB, MOBI, AZW3, FB2/FBZ, CBZ. */
import './books.css';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { openBook, type BookController } from './book-view';

/** Start downloading the ebook engine early. */
export const preload = () => import('foliate-js/view.js');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const book = (await openBook(file, ctx.mount, ctx.fontScale)) as BookController & { restyle: () => void };
  return {
    title: book.title,
    meta: () => [book.author, ctx.format?.name ?? 'FictionBook'].filter(Boolean),
    tools: () => book.tools(),
    onFontScale: () => book.restyle(),
    print: () => void book.print(),
    destroy: () => book.destroy(),
  };
}
