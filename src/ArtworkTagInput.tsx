import { useEffect, useId, useMemo, useState } from "react";
import {
  MAX_ARTWORK_TAGS,
  MAX_ARTWORK_TAG_LENGTH,
  normaliseArtworkTag,
  slugifyDiscoveryValue,
} from "../shared/artwork-tags";

type TagSuggestion = { tag: string; artwork_count: number };

export default function ArtworkTagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [error, setError] = useState("");
  const listId = useId();

  useEffect(() => {
    fetch("/api/tags")
      .then((response) => response.ok ? response.json() as Promise<TagSuggestion[]> : [])
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, []);

  const availableSuggestions = useMemo(() => {
    const selected = new Set(value.map(slugifyDiscoveryValue));
    return suggestions.filter(({ tag }) => !selected.has(slugifyDiscoveryValue(tag)));
  }, [suggestions, value]);

  function addTag(rawValue = input) {
    const tag = normaliseArtworkTag(rawValue);

    if (!tag) {
      setError(`Use between 2 and ${MAX_ARTWORK_TAG_LENGTH} characters.`);
      return;
    }

    if (value.length >= MAX_ARTWORK_TAGS) {
      setError(`You can add up to ${MAX_ARTWORK_TAGS} tags.`);
      return;
    }

    const key = slugifyDiscoveryValue(tag);
    if (value.some((existing) => slugifyDiscoveryValue(existing) === key)) {
      setInput("");
      setError("");
      return;
    }

    const existing = suggestions.find(
      (suggestion) => slugifyDiscoveryValue(suggestion.tag) === key,
    );
    onChange([...value, existing?.tag ?? tag]);
    setInput("");
    setError("");
  }

  return (
    <fieldset className="artwork-tag-picker">
      <legend>Tags <span>Add up to {MAX_ARTWORK_TAGS}</span></legend>

      {value.length > 0 && (
        <div className="artwork-tag-selection" aria-label="Selected tags">
          {value.map((tag) => (
            <button
              type="button"
              key={slugifyDiscoveryValue(tag)}
              onClick={() => onChange(value.filter((existing) => existing !== tag))}
              aria-label={`Remove ${tag} tag`}
            >
              {tag} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="artwork-tag-entry">
        <input
          type="text"
          value={input}
          list={listId}
          maxLength={MAX_ARTWORK_TAG_LENGTH}
          disabled={value.length >= MAX_ARTWORK_TAGS}
          placeholder={value.length >= MAX_ARTWORK_TAGS ? "Maximum reached" : "Type a tag"}
          onChange={(event) => {
            setInput(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
        />
        <datalist id={listId}>
          {availableSuggestions.map(({ tag }) => <option key={tag} value={tag} />)}
        </datalist>
        <button
          type="button"
          className="secondary-button"
          disabled={!input.trim() || value.length >= MAX_ARTWORK_TAGS}
          onClick={() => addTag()}
        >
          Add tag
        </button>
      </div>

      <p className="artwork-tag-help">
        Press Enter or comma to add. Previously used tags will be suggested as you type.
      </p>
      {error && <p className="form-error artwork-tag-error" role="alert">{error}</p>}
    </fieldset>
  );
}
