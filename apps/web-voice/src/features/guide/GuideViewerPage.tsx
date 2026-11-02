import { Alert, Button, IconButton, Skeleton } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-react';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

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
 * Reads a Panduan PDF inside CARE: pages render as they near the screen from
 * range requests, so the first page shows before the whole file arrives, and
 * the text layer keeps the PDF searchable.
 */
export function GuideViewerPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const guides = useQuery({ queryKey: voiceQuery(sessionId, 'guides'), queryFn: api.guides });
  const guide = guides.data?.items.find((item) => item.id === id);
  const fileUrl = `/api/v1/guides/${id}/file`;
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
  const pageTexts = useRef(new Map<number, string>());

  useEffect(() => {
    if (!supported || !id) return undefined;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setFailed(false);
    pageTexts.current = new Map();
    void loadPdfJs()
      .then(
        (pdfjs) =>
          pdfjs.getDocument({
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

  const goTo = (pageNumber: number) =>
    document.getElementById(`guide-page-${pageNumber}`)?.scrollIntoView({ block: 'start' });

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

  return (
    <div className="guide-viewer">
      <header className="guide-viewer__bar">
        <IconButton
          aria-label="Kembali ke Panduan"
          variant="ghost"
          onClick={() => void navigate('/panduan')}
        >
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="guide-viewer__title">{guide?.title ?? 'Panduan'}</h1>
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
        <a
          className="guide-viewer__open"
          href={fileUrl}
          target="_blank"
          rel="noopener"
          aria-label="Buka file PDF"
        >
          <ExternalLink size={19} />
        </a>
      </header>
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
      {!supported || failed ? (
        <div className="guide-viewer__fallback">
          {failed ? (
            <Alert tone="danger" title="Panduan gagal dimuat">
              Periksa koneksi lalu coba lagi.
            </Alert>
          ) : null}
          <Button onClick={() => window.open(fileUrl, '_blank', 'noopener')}>
            <ExternalLink size={16} /> Buka PDF
          </Button>
        </div>
      ) : !doc ? (
        <div className="guide-viewer__pages">
          <Skeleton className="guide-viewer__placeholder" label="Memuat panduan" />
        </div>
      ) : (
        <div className="guide-viewer__pages">
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
  const [visible, setVisible] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);
  const [width, setWidth] = useState(0);

  // Re-render sharp after rotation or a window resize.
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

  useEffect(() => {
    const element = frame.current;
    if (!element || visible) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !width || !frame.current || !canvas.current || !text.current) return undefined;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const page = await doc.getPage(pageNumber);
      if (cancelled || !frame.current || !canvas.current || !text.current) return;
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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
  }, [doc, pageNumber, visible, width]);

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
