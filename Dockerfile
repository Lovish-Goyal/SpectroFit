FROM alpine:3.21

RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY bin/engine-linux ./engine
RUN chmod +x ./engine

EXPOSE 8080

CMD ["./engine"]
