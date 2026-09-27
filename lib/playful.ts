export type PlayfulAnswer = "yes" | "no";

// A transparent game rule, not a predictive or statistical method.
export function numerology(question: string, date: Date): { answer: PlayfulAnswer; number: number } {
  const letters = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  const dateDigits = `${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}${date.getFullYear()}`;
  const sum = [...letters].reduce((total, letter) => total + ((letter.charCodeAt(0) - 65) % 9 + 1), 0)
    + [...dateDigits].reduce((total, digit) => total + Number(digit), 0);
  const number = (sum - 1) % 9 + 1;
  return { number, answer: number % 2 === 1 ? "yes" : "no" };
}

export function drawAnswer(): PlayfulAnswer {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 2 === 0 ? "yes" : "no";
}
