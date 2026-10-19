import type { ReactNode } from "react";
import styles from "./CardList.module.css";

export interface CardListProps {
  readonly children: ReactNode;
}

/** A list shown as a stack of cards; each item is a `Card`. */
export function CardList({ children }: CardListProps) {
  return <ul className={styles.list}>{children}</ul>;
}

export interface CardProps {
  readonly children: ReactNode;
}

/** One item of a `CardList`, on a panel of its own. */
export function Card({ children }: CardProps) {
  return <li className={styles.card}>{children}</li>;
}
