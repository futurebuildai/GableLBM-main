package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load(filepath.Join(projectRoot(), ".env"))

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping: %v", err)
	}

	sqlPath := filepath.Join(projectRoot(), "backend", "seed.sql")
	data, err := os.ReadFile(sqlPath)
	if err != nil {
		log.Fatalf("read seed.sql: %v", err)
	}

	_, err = pool.Exec(ctx, string(data))
	if err != nil {
		log.Fatalf("seed: %v", err)
	}

	fmt.Println("✓ Seed data applied successfully")
}

func projectRoot() string {
	_, filename, _, _ := runtime.Caller(0)
	// backend/cmd/seed/main.go → go up 3 levels to project root
	return filepath.Join(filepath.Dir(filename), "..", "..", "..")
}
