import React, { useMemo } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle, indentUnit } from "@codemirror/language";
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
      const highlightRegex = /==([^=\n]+)==/g;
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
          // Only hide marks for inline elements, not fenced code blocks
          const isMark = (name.includes("Mark") && name !== "ListMark" && name !== "QuoteMark") || name === "URL" || name === "CodeInfo";
          
          if (isMark) {
            const parent = node.node.parent;
            // Don't hide triple backticks for fenced code blocks as it's confusing
            if (parent && parent.name === "FencedCode" && (name === "CodeMark" || name === "CodeInfo")) {
              return;
            }

            const nodeLine = view.state.doc.lineAt(node.from);
            if (nodeLine.number !== activeLine.number) {
              decos.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
            }
          }
        }
      });
    }

    // 3. Sort and add to builder
    decos.sort((a, b) => a.from - b.from || a.to - b.to);
    
    let lastPos = -1;
    for (const deco of decos) {
      if (deco.from >= lastPos && deco.from < deco.to) {
        try {
          builder.add(deco.from, deco.to, deco.deco);
          lastPos = deco.to;
        } catch (e) {
          // Skip overlapping or invalid ranges
        }
      }
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

const livePreviewHighlighting = HighlightStyle.define([
  { tag: t.heading1, fontSize: "2em", fontWeight: "bold", color: "hsl(var(--primary))" },
  { tag: t.heading2, fontSize: "1.75em", fontWeight: "bold", color: "hsl(var(--primary))" },
  { tag: t.heading3, fontSize: "1.5em", fontWeight: "bold", color: "hsl(var(--primary))" },
  { tag: t.heading4, fontSize: "1.25em", fontWeight: "bold" },
  { tag: t.heading5, fontSize: "1.1em", fontWeight: "bold" },
  { tag: t.heading6, fontSize: "1em", fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "hsl(var(--primary))", textDecoration: "underline" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", backgroundColor: "hsl(var(--muted))", padding: "0.1em 0.3em", borderRadius: "3px", fontSize: "0.9em" },
  { tag: t.quote, color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
  // Enhanced syntax highlighting for code blocks
  { tag: t.keyword, color: "#c678dd", fontWeight: "bold" },
  { tag: t.operator, color: "#56b6c2" },
  { tag: t.string, color: "#98c379" },
  { tag: t.comment, color: "#abb2bf", fontStyle: "italic" },
  { tag: t.number, color: "#d19a66" },
  { tag: t.variableName, color: "#e06c75" },
  { tag: t.function(t.variableName), color: "#61afef" },
  { tag: t.propertyName, color: "#d19a66" },
  { tag: t.typeName, color: "#e5c07b" },
  { tag: t.className, color: "#e5c07b" },
  { tag: t.atom, color: "#d19a66" },
  { tag: t.bool, color: "#d19a66" },
  { tag: t.meta, color: "#abb2bf" },
  { tag: t.punctuation, color: "#abb2bf" },
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
      EditorView.lineWrapping,
      indentUnit.of("  "),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true })
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
