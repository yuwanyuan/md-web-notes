import React, { useMemo } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const hideMarksPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const selection = view.state.selection.main;
    const activeLine = view.state.doc.lineAt(selection.head);
    const decos: { from: number, to: number, deco: Decoration }[] = [];

    for (let {from, to} of view.visibleRanges) {
      // 1. Collect Highlight decorations (==text==)
      const text = view.state.sliceDoc(from, to);
      const highlightRegex = /==([^=]+)==/g;
      let match;
      while ((match = highlightRegex.exec(text)) !== null) {
        const start = from + match.index;
        const end = start + match[0].length;
        const nodeLine = view.state.doc.lineAt(start);
        
        // Style the text between ==
        decos.push({
          from: start + 2, 
          to: end - 2, 
          deco: Decoration.mark({
            attributes: { class: "cm-highlight" }
          })
        });

        // Hide the == marks if not on active line
        if (nodeLine.number !== activeLine.number) {
          decos.push({ from: start, to: start + 2, deco: Decoration.replace({}) });
          decos.push({ from: end - 2, to: end, deco: Decoration.replace({}) });
        }
      }

      // 2. Collect Syntax Tree decorations
      syntaxTree(view.state).iterate({
        from, to,
        enter: (node) => {
          const name = node.name;
          const isMark = (name.includes("Mark") && name !== "ListMark") || name === "URL" || name === "CodeInfo";
          if (isMark) {
            const nodeLine = view.state.doc.lineAt(node.from);
            if (nodeLine.number !== activeLine.number) {
              decos.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
            }
          }
        }
      });
    }

    // 3. Sort and add to builder
    decos.sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return a.to - b.to;
    });
    
    let lastFrom = -1;
    let lastTo = -1;
    for (const deco of decos) {
      // Ensure we don't add overlapping identical ranges or out-of-order ranges
      if (deco.from > lastFrom || (deco.from === lastFrom && deco.to >= lastTo)) {
        if (deco.from < deco.to) {
          try {
            builder.add(deco.from, deco.to, deco.deco);
            lastFrom = deco.from;
            lastTo = deco.to;
          } catch (e) {
            console.warn("Failed to add decoration:", e);
          }
        }
      }
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

const livePreviewHighlighting = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2.2em", fontWeight: "bold" },
  { tag: t.heading2, fontSize: "1.8em", fontWeight: "bold" },
  { tag: t.heading3, fontSize: "1.4em", fontWeight: "bold" },
  { tag: t.heading4, fontSize: "1.2em", fontWeight: "bold" },
  { tag: t.heading5, fontSize: "1em", fontWeight: "bold" },
  { tag: t.heading6, fontSize: "0.85em", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "hsl(var(--primary))", textDecoration: "underline" },
  { tag: t.monospace, fontFamily: "monospace", backgroundColor: "hsl(var(--muted))", padding: "0.2em 0.4em", borderRadius: "3px", fontSize: "0.9em" },
  { tag: t.quote, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
]);

const customTheme = EditorView.theme({
  "&": {
    fontSize: "15px",
    fontFamily: "inherit",
    height: "100%",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    fontFamily: "inherit",
    padding: "24px",
    maxWidth: "800px",
    margin: "0 auto",
  },
  ".cm-line": {
    lineHeight: "1.6",
    paddingBottom: "0.2em",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  }
});

interface LivePreviewEditorProps {
  value: string;
  onChange: (value: string) => void;
  liveMode?: boolean;
  theme?: 'dark' | 'light';
  editorRef?: React.RefObject<ReactCodeMirrorRef>;
}

export function LivePreviewEditor({ value, onChange, liveMode = true, theme = 'light', editorRef }: LivePreviewEditorProps) {
  const extensions = useMemo(() => {
    const exts = [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      customTheme,
      EditorView.lineWrapping
    ];
    if (liveMode) {
      exts.push(hideMarksPlugin);
      exts.push(syntaxHighlighting(livePreviewHighlighting));
    }
    return exts;
  }, [liveMode]);

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      theme={theme}
      extensions={extensions}
      className="h-full w-full text-foreground"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: false,
      }}
    />
  );
}
