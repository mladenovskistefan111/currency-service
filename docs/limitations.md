# Known limitations

- Rates are a static snapshot; they are never refreshed.
- The rates file is read and parsed from disk on every request (cheap for 33 entries, but not free).
- Conversion uses floating-point arithmetic and truncates; results can be off by a nano-unit.
- `SIGTERM` does not terminate the process (see Graceful shutdown).
- The Docker `HEALTHCHECK` depends on `PORT` being set.
