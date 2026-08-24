import { useEffect, useState, type InputHTMLAttributes } from "react";

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
  ...props
}: BufferedNumberInputProps) {
  const [input, setInput] = useState(String(value));

  useEffect(() => {
    setInput(String(value));
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      value={input}
      onChange={(event) => {
        const nextInput = event.currentTarget.value;
        setInput(nextInput);
        const nextValue = Number(nextInput);
        if (nextInput !== "" && Number.isFinite(nextValue)) {
          onValueChange(nextValue);
        }
      }}
      onBlur={(event) => {
        setInput(String(value));
        onBlur?.(event);
      }}
    />
  );
}
