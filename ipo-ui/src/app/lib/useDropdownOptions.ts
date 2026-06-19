"use client";

import * as React from "react";
import { fetchJson } from "@/lib/api";
import type { DropdownOptions } from "./publicHomeTypes";

const EMPTY: DropdownOptions = {
  faPersons: [],
  faCompanies: [],
  underwriters: [],
};

let cached: DropdownOptions | null = null;
let inflight: Promise<DropdownOptions> | null = null;
let loaded = false;

const DropdownOptionsContext = React.createContext<DropdownOptions | null>(null);

export function DropdownOptionsProvider({
  initialOptions,
  children,
}: {
  initialOptions: DropdownOptions;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    cached = initialOptions;
    loaded = true;
  }, [initialOptions]);

  return React.createElement(
    DropdownOptionsContext.Provider,
    { value: initialOptions },
    children,
  );
}

export function preloadDropdownOptions(): Promise<DropdownOptions> {
  if (loaded) return Promise.resolve(cached ?? EMPTY);

  if (!inflight) {
    inflight = fetchJson<DropdownOptions>("/api/dropdown-options")
      .then((data) => {
        cached = data;
        return data;
      })
      .catch(() => {
        cached = EMPTY;
        return EMPTY;
      })
      .finally(() => {
        loaded = true;
        inflight = null;
      });
  }

  return inflight;
}

export function useDropdownOptions(): DropdownOptions {
  const serverOptions = React.useContext(DropdownOptionsContext);
  const [options, setOptions] = React.useState<DropdownOptions>(
    serverOptions ?? cached ?? EMPTY,
  );

  React.useEffect(() => {
    if (serverOptions) {
      cached = serverOptions;
      loaded = true;
      return;
    }

    let active = true;
    preloadDropdownOptions().then((data) => {
      if (active) setOptions(data);
    });
    return () => {
      active = false;
    };
  }, [serverOptions]);

  return serverOptions ?? options;
}
