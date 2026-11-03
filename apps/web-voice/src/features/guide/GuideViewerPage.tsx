import { Alert, Button, IconButton, Skeleton } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import {
  downloadGuide,
  guideFileUrl,
  pageAt,
  scrollParent,
  ZOOM_DEFAULT,
  zoomStep,
} from './guide-viewer-utils';

const PDFJS_BASE = typeof __PDFJS_BASE__ === 'string' ? __PDFJS_BASE__ : '/pdfjs/';

/** pdf.js 4 needs a modern engine; older browsers keep opening the PDF directly. */
export function canUseGuideViewer() {
  return (
    typeof window !== 'undefined' &&
    'structuredClone' in window &&
    typeof ReadableStream !== 'undefined' &&
    typeof (Array.prototype as { at?: unknown }).at === 'function'
  );
}

let pdfjsPromise: Promise<typeof PdfJs> | null = null;
function loadPdfJs() {
  pdfjsPromise ??= (import(/* @vite-ignore */ `${PDFJS_BASE}pdf.min.js`) as Promise<typeof PdfJs>)
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.js`;
      return pdfjs;
    })
    .catch((error: unknown) => {
      pdfjsPromise = null;
      throw error;
    });
  return pdfjsPromise;
}

const normalize = (value: string) => value.toLocaleLowerCase('id-ID');

/**
 * Keeps one page canvas under iOS Safari's canvas limit (about 16.7 MP) and
 * bounds memory at high zoom; off-screen pages also release their canvas.
 */
const MAX_CANVAS_PIXELS = 12_000_000;

/**
 * Reads a Panduan PDF inside CARE with pdf.js, keeping the original file: pages
 * render as they near the screen from range requests, so the first page shows
 * before the whole file arrives; the text layer keeps the PDF searchable; zoom
 * re-renders pages sharp; the original can be downloaded.
 */
export function GuideViewerPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const guides = useQuery({ queryKey: voiceQuery(sessionId, 'guides'), queryFn: api.guides });
  const guide = guides.data?.items.find((item) => item.id === id);
  const title = guide?.title ?? 'Panduan';
  const fileUrl = guideFileUrl(id);
  const supported = canUseGuideViewer();

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [failed, setFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<number[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const pageTexts = useRef(new Map<number, string>());
  const head = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  /** Where the reader was before a zoom change, so the same spot stays in view. */
  const zoomAnchor = useRef<{ page: number; fraction: number; centre: number } | null>(null);

  useEffect(() => {
    if (!supported || !id) return undefined;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setFailed(false);
    setCurrentPage(1);
    pageTexts.current = new Map();
    void loadPdfJs()
      .then(
        (pdfjs) =>
          pdfjs.getDocument({
            // Same-origin, so the session cookie goes with every range request.
            url: fileUrl,
            disableAutoFetch: true,
            disableStream: true,
            rangeChunkSize: 65_536,
            isEvalSupported: false,
            standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
          }).promise,
      )
      .then(async (pdf) => {
        loaded = pdf;
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(viewport.height / viewport.width);
        setDoc(pdf);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [fileUrl, id, supported]);

  const textOf = useCallback(
    async (pageNumber: number) => {
      const cached = pageTexts.current.get(pageNumber);
      if (cached !== undefined || !doc) return cached ?? '';
      const content = await (await doc.getPage(pageNumber)).getTextContent();
      const text = normalize(
        content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
      );
      pageTexts.current.set(pageNumber, text);
      return text;
    },
    [doc],
  );

  /** The y position (viewport) just under the sticky bars. */
  const readingLine = () => (head.current?.getBoundingClientRect().bottom ?? 0) + 1;
  const pageElement = (pageNumber: number) =>
    document.getElementById(`guide-page-${pageNumber}`) as HTMLElement | null;

  /** Scroll position set by a page jump; the jumped-to page stays current until the reader scrolls. */
  const jumpedTo = useRef<number | null>(null);

  const goTo = (pageNumber: number) => {
    const element = pageElement(pageNumber);
    if (!element) return;
    const scroller = scrollParent(element);
    scroller.scrollTop += element.getBoundingClientRect().top - readingLine() - 8;
    // Near the end the page may not reach the bars; still show the page asked for.
    jumpedTo.current = scroller.scrollTop;
    setCurrentPage(pageNumber);
  };

  // Track the page under the bars while reading, for "N / total".
  useEffect(() => {
    if (!doc) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const strip = pages.current;
      if (!strip) return;
      const scroller = scrollParent(strip);
      if (jumpedTo.current !== null && Math.abs(scroller.scrollTop - jumpedTo.current) < 2) return;
      jumpedTo.current = null;
      if (
        scroller.scrollTop > 0 &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      )
        return setCurrentPage(doc.numPages);
      const bounds = Array.from(
        strip.querySelectorAll<HTMLElement>('.guide-viewer__page'),
        (element) => element.getBoundingClientRect(),
      );
      setCurrentPage(pageAt(bounds, readingLine() + 24));
    };
    const onScroll = () => {
      frame ||= window.requestAnimationFrame(update);
    };
    // Capture catches the scroll of whichever element scrolls (the shell or the page).
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [doc]);

  const changeZoom = (next: number) => {
    if (next === zoom) return;
    const element = pageElement(currentPage);
    const strip = pages.current;
    if (element && strip) {
      const rect = element.getBoundingClientRect();
      zoomAnchor.current = {
        page: currentPage,
        fraction: rect.height ? (readingLine() - rect.top) / rect.height : 0,
        centre: (strip.scrollLeft + strip.clientWidth / 2) / Math.max(strip.scrollWidth, 1),
      };
    }
    setZoom(next);
  };

  // After a zoom change, put the same part of the same page back under the bars.
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    const element = anchor ? pageElement(anchor.page) : null;
    if (!anchor || !element) return;
    const rect = element.getBoundingClientRect();
    scrollParent(element).scrollTop +=
      rect.top + Math.max(anchor.fraction, 0) * rect.height - readingLine();
    const strip = pages.current;
    if (strip) strip.scrollLeft = anchor.centre * strip.scrollWidth - strip.clientWidth / 2;
  }, [zoom]);

  const commitPage = () => {
    if (pageDraft === null || !doc) return;
    const wanted = Number.parseInt(pageDraft, 10);
    setPageDraft(null);
    if (Number.isFinite(wanted)) goTo(Math.min(Math.max(wanted, 1), doc.numPages));
  };

  const download = async () => {
    setDownloading(true);
    setDownloadFailed(false);
    try {
      await downloadGuide(id, title);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const term = normalize(draft.trim());
    setQuery(term);
    setMatchIndex(0);
    if (!term || !doc) return setMatches([]);
    setSearching(true);
    const found: number[] = [];
    for (let page = 1; page <= doc.numPages; page += 1)
      if ((await textOf(page)).includes(term)) found.push(page);
    setSearching(false);
    setMatches(found);
    if (found[0]) goTo(found[0]);
  };
  const step = (offset: number) => {
    if (!matches.length) return;
    const next = (matchIndex + offset + matches.length) % matches.length;
    setMatchIndex(next);
    goTo(matches[next]!);
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setDraft('');
    setQuery('');
    setMatches([]);
  };

  const zoomOut = zoomStep(zoom, -1);
  const zoomIn = zoomStep(zoom, 1);

  return (
    <div className="guide-viewer">
      <div ref={head} className="guide-viewer__head">
        <header className="guide-viewer__bar">
          <IconButton
            aria-label="Kembali ke Panduan"
            variant="ghost"
            onClick={() => void navigate('/panduan')}
          >
            <ArrowLeft size={20} />
          </IconButton>
          <h1 className="guide-viewer__title">{title}</h1>
          {supported && doc ? (
            <IconButton
              aria-label="Cari di panduan"
              variant="ghost"
              aria-expanded={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            >
              {searchOpen ? <X size={20} /> : <Search size={20} />}
            </IconButton>
          ) : null}
          <IconButton
            aria-label="Unduh PDF"
            variant="ghost"
            loading={downloading}
            disabled={downloading}
            onClick={() => void download()}
          >
            <Download size={20} />
          </IconButton>
        </header>
        {supported && doc ? (
          <div className="guide-viewer__tools" role="toolbar" aria-label="Halaman dan zoom">
            <div className="guide-viewer__tool-group">
              <IconButton
                aria-label="Halaman sebelumnya"
                variant="ghost"
                disabled={currentPage <= 1}
                onClick={() => goTo(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </IconButton>
              <input
                className="guide-viewer__page-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="go"
                aria-label={`Halaman, 1 sampai ${doc.numPages}`}
                value={pageDraft ?? String(currentPage)}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ''))}
                onBlur={commitPage}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitPage();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    setPageDraft(null);
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="guide-viewer__page-total">/ {doc.numPages}</span>
              <IconButton
                aria-label="Halaman berikutnya"
                variant="ghost"
                disabled={currentPage >= doc.numPages}
                onClick={() => goTo(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </IconButton>
            </div>
            <div className="guide-viewer__tool-group">
              <IconButton
                aria-label="Perkecil"
                variant="ghost"
                disabled={zoomOut === zoom}
                onClick={() => changeZoom(zoomOut)}
              >
                <ZoomOut size={18} />
              </IconButton>
              <button
                type="button"
                className="guide-viewer__zoom-level"
                aria-label={`Zoom ${Math.round(zoom * 100)}%, kembali ke lebar layar`}
                onClick={() => changeZoom(ZOOM_DEFAULT)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <IconButton
                aria-label="Perbesar"
                variant="ghost"
                disabled={zoomIn === zoom}
                onClick={() => changeZoom(zoomIn)}
              >
                <ZoomIn size={18} />
              </IconButton>
            </div>
          </div>
        ) : null}
        {searchOpen ? (
          <form
            className="guide-viewer__search"
            role="search"
            onSubmit={(event) => void runSearch(event)}
          >
            <input
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Cari kata"
              aria-label="Cari kata di panduan"
              autoFocus
              enterKeyHint="search"
            />
            <span className="guide-viewer__count" aria-live="polite">
              {searching
                ? 'Mencari…'
                : query
                  ? matches.length
                    ? `Hal ${matches[matchIndex]} · ${matchIndex + 1}/${matches.length}`
                    : 'Tidak ada'
                  : ''}
            </span>
            <IconButton
              type="button"
              aria-label="Hasil sebelumnya"
              variant="ghost"
              disabled={matches.length < 2}
              onClick={() => step(-1)}
            >
              <ChevronUp size={18} />
            </IconButton>
            <IconButton
              type="button"
              aria-label="Hasil berikutnya"
              variant="ghost"
              disabled={matches.length < 2}
              onClick={() => step(1)}
            >
              <ChevronDown size={18} />
            </IconButton>
          </form>
        ) : null}
      </div>
      {downloadFailed ? (
        <div className="guide-viewer__notice">
          <Alert tone="danger" title="PDF gagal diunduh">
            Periksa koneksi lalu coba lagi.
          </Alert>
        </div>
      ) : null}
      {!supported || failed ? (
        <div className="guide-viewer__fallback">
          {failed ? (
            <Alert tone="danger" title="Panduan gagal dimuat">
              Periksa koneksi lalu coba lagi.
            </Alert>
          ) : (
            <p>Browser ini belum bisa menampilkan panduan di CARE. Unduh PDF untuk membacanya.</p>
          )}
          <Button loading={downloading} disabled={downloading} onClick={() => void download()}>
            <Download size={16} /> Unduh PDF
          </Button>
        </div>
      ) : !doc ? (
        <div className="guide-viewer__pages">
          <Skeleton className="guide-viewer__placeholder" label="Memuat panduan" />
        </div>
      ) : (
        <div
          ref={pages}
          className="guide-viewer__pages"
          style={{ '--guide-zoom': zoom } as CSSProperties}
        >
          {Array.from({ length: doc.numPages }, (_, index) => (
            <PdfPage
              key={index + 1}
              doc={doc}
              pageNumber={index + 1}
              ratio={ratio}
              query={matches.includes(index + 1) ? query : ''}
              focused={matches[matchIndex] === index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PdfPage({
  doc,
  pageNumber,
  ratio,
  query,
  focused,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  ratio: number;
  query: string;
  /** The current search result: bring its first hit to the middle of the screen. */
  focused: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);
  const [width, setWidth] = useState(0);

  // Re-render sharp after a zoom change, rotation or a window resize.
  useEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      setWidth((current) => (Math.abs(current - next) > 8 ? next : current));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Render pages near the screen and release the canvas of pages far from it,
  // so a long guide at high zoom does not exhaust a phone's memory.
  useEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setNear(entry.isIntersecting);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !frame.current || !canvas.current || !text.current) return undefined;
    if (!near) {
      canvas.current.width = 0;
      canvas.current.height = 0;
      text.current.replaceChildren();
      setRendered(false);
      return undefined;
    }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const page = await doc.getPage(pageNumber);
      if (cancelled || !frame.current || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
      );
      const target = canvas.current;
      target.width = Math.floor(viewport.width * pixelRatio);
      target.height = Math.floor(viewport.height * pixelRatio);
      frame.current.style.setProperty('--scale-factor', String(viewport.scale));
      frame.current.style.setProperty('--total-scale-factor', String(viewport.scale));
      frame.current.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      const render = page.render({
        canvasContext: target.getContext('2d')!,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      task = render;
      await render.promise;
      if (cancelled) return;
      text.current.replaceChildren();
      await new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text.current,
        viewport,
      }).render();
      if (!cancelled) setRendered(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, near, pageNumber, width]);

  useEffect(() => {
    if (!rendered || !text.current) return;
    for (const span of text.current.querySelectorAll('span')) {
      const hit = !!query && normalize(span.textContent ?? '').includes(query);
      span.classList.toggle('guide-viewer__hit', hit);
    }
    if (focused && query)
      text.current.querySelector('.guide-viewer__hit')?.scrollIntoView({ block: 'center' });
  }, [focused, query, rendered]);

  return (
    <div
      ref={frame}
      id={`guide-page-${pageNumber}`}
      className="guide-viewer__page"
      style={{ aspectRatio: `1 / ${ratio}` }}
      role="group"
      aria-label={`Halaman ${pageNumber} dari ${doc.numPages}`}
    >
      <canvas ref={canvas} aria-hidden="true" />
      <div ref={text} className="textLayer" />
      <span className="guide-viewer__page-number" aria-hidden="true">
        {pageNumber}/{doc.numPages}
      </span>
    </div>
  );
}
