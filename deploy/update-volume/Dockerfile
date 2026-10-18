# Fixed supervisor and matching PG17 clients. Application versions live in a
# separate persistent mount; the PostgreSQL server is never started here.
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS node
FROM postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /opt/baize-updater/NODE-LICENSE
COPY --from=node /usr/lib/x86_64-linux-gnu/libatomic.so.1* /usr/local/lib/
COPY --chmod=0755 dist/updater /opt/baize-updater
RUN ldconfig && node --version && pg_dump --version && command -v flock
USER 1000:1000
WORKDIR /opt/baize-updater
ENTRYPOINT ["node","/opt/baize-updater/baize-updater.mjs"]
CMD ["--config","/run/secrets/updater.json"]
