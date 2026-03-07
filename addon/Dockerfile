ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache curl jq

COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
