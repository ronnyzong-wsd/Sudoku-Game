FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV SUDOKU_HOST=0.0.0.0 SUDOKU_PORT=8080
EXPOSE 8080
CMD ["python","server.py"]
