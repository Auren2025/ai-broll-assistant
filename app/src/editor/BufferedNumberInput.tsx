import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { parseNumberCommit } from "./numberCommit";

interface BufferedNumberInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange"
  > {
  value: number;
  onValueChange: (value: number) => void;
}

export function BufferedNumberInput({
  value,
  onValueChange,
  onBlur,
  onKeyDown,
  ...props
}: BufferedNumberInputProps) {
  const [input, setInput] = useState(String(value));
  // Last value actually committed (or received from the parent). Guards
  // against double commits, e.g. Enter committing and blur committing again
  // before the parent re-renders with the new value.
  const lastCommittedRef = useRef(value);
  // True when the current change was produced by the keyboard. Native
  // spinner clicks produce change events without a keydown, so they commit
  // immediately and stay live; typed text buffers until blur/Enter so one
  // typing session yields a single undo entry.
  const typedRef = useRef(false);

  useEffect(() => {
    lastCommittedRef.current = value;
    setInput(String(value));
  }, [value ]);

  function commit(raw: string): void {
    const nextValue = parseNumberCommit(raw, lastCommittedRef.current);
    if (nextValue === null) return;
    lastCommittedRef.current = nextValue;
    onValueChange(nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    typedRef.current = true;
    if (event.key === "Enter") {
      commit(event.currentTarget.value);
      event.currentTarget.blur();
    }
    onKeyDown?.(event);
  }

  return (
    <input
      {...props}
      type="number"
      value={input}
      onKeyDown={handleKeyDown}
      onChange={(event) => {
        const nextInput = event.currentTarget.value;
        setInput(nextInput);
        if (typedRef.current) {
          typedRef.current = false;
          return;
        }
        commit(nextInput);
      }}
      onBlur={(event) => {
        commit(event.currentTarget.value);
        setInput(String(lastCommittedRef.current));
        onBlur?.(event);
      }}
    />
  );
}
