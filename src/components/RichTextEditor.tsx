"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Bold, Italic, Link2, Palette, Type, Eraser } from "lucide-react";

// A minimal WYSIWYG editor for the admin email composer (bold/italic, font
// family, font size, text color, links) -- replaces the old "type
// **bold** and [text](url) by hand" markdown-lite convention with an
// actual formatting toolbar. Built directly on the browser's
// contentEditable + execCommand rather than pulling in a rich-text
// library: this is a single admin-only screen, not end-user facing, used
// from Chrome in practice (see the admin panel screenshots), and
// execCommand -- despite being informally "legacy" -- is still universally
// supported for exactly this kind of small formatting toolbar and keeps
// this dependency-free. `styleWithCSS` is turned on before every command
// so formatting comes out as inline `style="..."` (color/font-size/
// font-family) rather than old-school <font> tags -- that's what actually
// needs to survive into the emailed HTML document (see
// renderCampaignBodyHtml/sanitizeCampaignHtml in lib/emailTemplate.ts,
// which is what the saved HTML here eventually renders through).
//
// contentEditable is inherently *uncontrolled* -- React can't diff its
// children the way it does a normal input's value. So `value` is only
// ever pushed into the DOM imperatively, and only when it changed for a
// reason OTHER than the user's own typing here (loading a template,
// clearing the composer after a send) -- see lastEmittedRef below.
// Pushing it in on every render (e.g. naively syncing in a useEffect keyed
// on `value` alone) would reset the cursor to the start of the box on
// every keystroke, since the DOM node would get overwritten out from
// under the user mid-type.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>(value);
  // The Range the user last had selected inside the editor. Clicking a
  // <button> toolbar control is protected from losing that selection by
  // onMouseDown preventDefault below (stops the click from blurring the
  // editor in the first place), but a native <select> genuinely has to
  // take focus to open its dropdown -- so for the font/size pickers we
  // explicitly save the selection on every change inside the editor and
  // restore it right before running the format command.
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedRef.current && value !== el.innerHTML) {
      el.innerHTML = value;
      lastEmittedRef.current = value;
    }
  }, [value]);

  function emit() {
    const el = editorRef.current;
    if (!el) return;
    lastEmittedRef.current = el.innerHTML;
    onChange(el.innerHTML);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function format(command: string, arg?: string) {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, arg);
    saveSelection();
    emit();
  }

  function insertLink() {
    const url = window.prompt("Link URL (must start with https://)");
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https:\/\//i.test(trimmed)) {
      window.alert("Links must start with https://");
      return;
    }
    format("createLink", trimmed);
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1 rounded-[11px] border border-[#ece5f5] bg-surface p-1.5">
        <ToolbarButton label="Bold" onClick={() => format("bold")}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => format("italic")}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={insertLink}>
          <Link2 size={14} />
        </ToolbarButton>
        <div className="mx-0.5 h-5 w-px bg-[#ece5f5]" />
        <span className="flex items-center gap-1 rounded-[8px] border border-[#ece5f5] px-1.5 py-1 text-[#a8a2bd]">
          <Type size={13} />
          <select
            title="Font"
            defaultValue=""
            onFocus={saveSelection}
            onChange={(e) => {
              if (!e.target.value) return;
              format("fontName", e.target.value);
              e.target.selectedIndex = 0;
            }}
            className="bg-transparent text-[11px] text-ink outline-none"
          >
            <option value="" disabled>
              Font
            </option>
            <option value="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">Default</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="'Courier New', monospace">Courier New</option>
            <option value="Verdana, sans-serif">Verdana</option>
            <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
          </select>
        </span>
        <select
          title="Size"
          defaultValue=""
          onFocus={saveSelection}
          onChange={(e) => {
            if (!e.target.value) return;
            // Legacy HTML font-size scale (1-7), not px -- but with
            // styleWithCSS on (see format() above), the browser writes
            // this out as a real `font-size: …px` inline style rather
            // than a <font size> attribute, which is what needs to
            // survive into the sent email HTML.
            format("fontSize", e.target.value);
            e.target.selectedIndex = 0;
          }}
          className="rounded-[8px] border border-[#ece5f5] bg-surface px-1.5 py-1 text-[11px] text-ink outline-none"
        >
          <option value="" disabled>
            Size
          </option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="7">X-Large</option>
        </select>
        <label
          title="Text color"
          className="flex items-center gap-1 rounded-[8px] border border-[#ece5f5] px-1.5 py-1 text-[#a8a2bd]"
        >
          <Palette size={13} />
          <input
            type="color"
            defaultValue="#1a1523"
            onFocus={saveSelection}
            onChange={(e) => format("foreColor", e.target.value)}
            className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <ToolbarButton label="Clear formatting" onClick={() => format("removeFormat")}>
          <Eraser size={14} />
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        className="rte-editable min-h-[140px] w-full overflow-y-auto rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
      />
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      // Keeps the browser's text selection inside the editor alive --
      // without this, the mousedown-then-click on the button blurs the
      // contentEditable first and the selection is gone before onClick
      // (and therefore format()) ever runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-[8px] p-1.5 text-[#6b6480] hover:bg-[#f5f2fb] hover:text-ink"
    >
      {children}
    </button>
  );
}
