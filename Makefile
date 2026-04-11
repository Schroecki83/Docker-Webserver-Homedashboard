IMAGE_NAME := home-dashboard
TAG        := latest

.PHONY: build dev up down clean

build:
	docker build -t $(IMAGE_NAME):$(TAG) .

dev:
	docker compose up --build

up:
	docker compose up -d

down:
	docker compose down

clean:
	docker rmi $(IMAGE_NAME):$(TAG) 2>/dev/null || true
