package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Executor is an interface that matches both pgxpool.Pool and pgx.Tx
type Executor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type DB struct {
	Pool *pgxpool.Pool
}

// PoolConfig holds configurable pool parameters.
type PoolConfig struct {
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	HealthCheckPeriod time.Duration
}

// DefaultPoolConfig returns sensible defaults for the connection pool.
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxConns:          10,
		MinConns:          2,
		MaxConnLifetime:   time.Hour,
		MaxConnIdleTime:   30 * time.Minute,
		HealthCheckPeriod: 1 * time.Minute,
	}
}

func Connect(connString string, opts ...PoolConfig) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("unable to parse connection string: %w", err)
	}

	pc := DefaultPoolConfig()
	if len(opts) > 0 {
		pc = opts[0]
	}
	config.MaxConns = pc.MaxConns
	config.MinConns = pc.MinConns
	config.MaxConnLifetime = pc.MaxConnLifetime
	config.MaxConnIdleTime = pc.MaxConnIdleTime
	config.HealthCheckPeriod = pc.HealthCheckPeriod

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	db.Pool.Close()
}

// RunInTx executes a function within a database transaction.
func (db *DB) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	// Check if we are already in a transaction
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		// Already in a transaction, just run the function
		return fn(ctx)
	}

	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		} else if err != nil {
			_ = tx.Rollback(ctx)
		} else {
			err = tx.Commit(ctx)
		}
	}()

	// Inject tx into context
	ctxWithTx := context.WithValue(ctx, txKey{}, tx)
	err = fn(ctxWithTx)
	return err
}

type txKey struct{}

func (db *DB) GetExecutor(ctx context.Context) Executor {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx
	}
	return db.Pool
}
