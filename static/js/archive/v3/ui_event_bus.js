const subscribers = new Map();

export function subscribe(eventName, listener) {
  if (typeof eventName !== "string" || !eventName) {
    throw new TypeError("subscribe(eventName, listener) requires an event name");
  }

  if (typeof listener !== "function") {
    throw new TypeError("subscribe(eventName, listener) requires a listener");
  }

  if (!subscribers.has(eventName)) {
    subscribers.set(eventName, new Set());
  }

  subscribers.get(eventName).add(listener);

  return () => unsubscribe(eventName, listener);
}

export function unsubscribe(eventName, listener) {
  subscribers.get(eventName)?.delete(listener);
}

export function emit(eventName, payload) {
  subscribers.get(eventName)?.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      console.error(`event bus listener failed for ${eventName}`, error);
    }
  });
}

window.eventBus = window.eventBus || {
  subscribe,
  unsubscribe,
  emit,
};

const socket = new WebSocket("ws://localhost:8000/ws/ui");

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.event === "theme_change") {
    if (typeof window.applyTheme === "function" && data.theme) {
      window.applyTheme(data.theme, { remote: false });
    }

    const css = data.css || {};
    Object.keys(css).forEach((key) => {
      document.documentElement.style.setProperty(key, css[key]);
    });
  }

  if (data.event) {
    emit(data.event, data);
  }
};
