// Simple event bus for cross-component communication
class EventBus {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(data));
  }
}

export const eventBus = new EventBus();

// Event names
export const EVENTS = {
  BATCH_UPDATED: 'batch:updated',
  BATCH_CREATED: 'batch:created',
  BATCH_DELETED: 'batch:deleted',
  FEED_LOGGED: 'feed:logged',
  WEIGHT_LOGGED: 'weight:logged',
};