import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Send, X, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { api, money } from "../lib";
import type { ChargingStation } from "../public/catalog";
import {
  answerQuestion,
  type AssistantMode,
  type HelpAnswer,
  type Topic,
} from "./answers";
import "./assistant.css";

type Turn = { id: number; question: string; answer: HelpAnswer };

const suggestions = [
  "How do I book a charger?",
  "What will charging cost?",
  "How do I become a host?",
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stationAnswer(
  question: string,
  answer: HelpAnswer,
  stations: ChargingStation[],
): HelpAnswer {
  const text = normalize(question);
  if (answer.topic && answer.topic !== "discover" && answer.topic !== "pricing")
    return answer;
  const matches = stations.filter((station) => {
    const name = normalize(station.name);
    const locality = normalize(station.locality);
    const brand = name.split(" ")[0];
    return (
      (name && (" " + text + " ").includes(" " + name + " ")) ||
      (locality && (" " + text + " ").includes(" " + locality + " ")) ||
      (brand.length > 5 && (" " + text + " ").includes(" " + brand + " "))
    );
  });
  if (!matches.length) return answer;
  const exactPlace = matches.some((station) => {
    const name = normalize(station.name);
    return [name, name.split(" ")[0], normalize(station.locality)].includes(
      text,
    );
  });
  const asksForListing =
    /\b(cost|price|prices|fee|rate|kwh|connector|slot|slots|charger|charging)\b/.test(
      text,
    );
  const unrelated =
    /\b(jokes?|poems?|weather|recipes?|movies?|music|scores?)\b/.test(text);
  if (!answer.topic && !exactPlace && (!asksForListing || unrelated))
    return answer;
  const selected = matches.slice(0, 3);
  return {
    topic: answer.topic ?? "discover",
    text:
      selected
        .map((station) => {
          return `${station.name}${station.sample ? " (demo listing)" : ""} in ${station.locality} lists ${station.connector} at ${station.powerKw} kW, ${money(station.pricePaise)}/kWh, and a ${money(station.feePaise)} convenience fee.`;
        })
        .join(" ") +
      (selected.every((station) => station.catalogExample)
        ? " These demo listings are for browsing only."
        : " Open the station page to check available slots."),
    links: selected.map((station) => ({
      label: station.name,
      to: "/chargers/" + encodeURIComponent(station.id),
    })),
  };
}

export function Assistant({ mode }: { mode: AssistantMode }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const lastTopic = useRef<Topic | undefined>(undefined);
  const nextTurn = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const helpId = useId();

  const stations = useQuery({
    queryKey: ["stations", "assistant-catalog"],
    queryFn: ({ signal }) =>
      api<{ stations: ChargingStation[] }>("/stations?limit=30", { signal }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (turns.length && open)
      latest.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, [turns, open]);

  function openAssistant() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setOpen(true);
    input.current?.focus();
  }

  function closeAssistant() {
    dialog.current?.close();
  }

  function ask(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    const response = answerQuestion(trimmed, mode, lastTopic.current);
    const answer = stationAnswer(
      trimmed,
      response,
      stations.data?.stations ?? [],
    );
    if (answer.topic) lastTopic.current = answer.topic;
    const turn = { id: ++nextTurn.current, question: trimmed, answer };
    setTurns((current) => [...current.slice(-13), turn]);
    setQuestion("");
    input.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(question);
  }

  return (
    <>
      <button
        className="pl-assistant-launch"
        ref={launcher}
        type="button"
        aria-label="Open PlugLink Assistant"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openAssistant}
      >
        <MessageCircle size={21} aria-hidden="true" />
        <span>Ask PlugLink</span>
      </button>
      <dialog
        id={panelId}
        ref={dialog}
        className="pl-assistant"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          launcher.current?.focus();
        }}
      >
        <section className="pl-assistant-shell">
          <header className="pl-assistant-header">
            <span className="pl-assistant-symbol">
              <Zap size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId}>PlugLink Assistant</h2>
              <p>Answers from PlugLink help</p>
            </div>
            <button
              type="button"
              className="pl-assistant-close"
              aria-label="Close PlugLink Assistant"
              onClick={closeAssistant}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </header>

          <div
            className="pl-assistant-thread"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
          >
            <div className="pl-assistant-reply">
              <p>
                Hi! I can help you find a charger, make a booking, or get
                started as a host.
              </p>
            </div>
            {turns.map(({ id, question: text, answer }) => (
              <div className="pl-assistant-turn" key={id}>
                <p className="pl-assistant-question">
                  <span className="pl-assistant-sr">You: </span>
                  {text}
                </p>
                <div className="pl-assistant-reply">
                  <p>
                    <span className="pl-assistant-sr">
                      PlugLink Assistant:{" "}
                    </span>
                    {answer.text}
                  </p>
                  {!!answer.links?.length && (
                    <ul>
                      {answer.links.map((link) => (
                        <li key={link.to}>
                          <Link to={link.to} onClick={closeAssistant}>
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            <div ref={latest} aria-hidden="true" />
          </div>

          {!turns.length && (
            <div
              className="pl-assistant-prompts"
              aria-label="Suggested questions"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form className="pl-assistant-form" onSubmit={submit}>
            <div className="pl-assistant-input-row">
              <label
                className="pl-assistant-sr"
                htmlFor={panelId + "-question"}
              >
                Ask a question
              </label>
              <input
                id={panelId + "-question"}
                ref={input}
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about PlugLink"
                maxLength={320}
                autoComplete="off"
                aria-describedby={helpId}
              />
              <button
                type="submit"
                aria-label="Send question"
                disabled={!question.trim()}
              >
                <Send size={19} aria-hidden="true" />
              </button>
            </div>
            <p id={helpId}>Keep passwords and payment details out of chat.</p>
          </form>
        </section>
      </dialog>
    </>
  );
}
