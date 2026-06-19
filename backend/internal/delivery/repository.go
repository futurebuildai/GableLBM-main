package delivery

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// Fleet

func (r *PostgresRepository) CreateVehicle(ctx context.Context, v *Vehicle) error {
	query := `
		INSERT INTO vehicles (name, vehicle_type, license_plate, capacity_weight_lbs,
		                      vin, year, make, model, insurance_expiry, next_service_date, odometer_miles, notes, photo_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		v.Name, v.VehicleType, v.LicensePlate, v.CapacityWeightLbs,
		v.VIN, v.Year, v.Make, v.Model, v.InsuranceExpiry, v.NextServiceDate, v.OdometerMiles, v.Notes, v.PhotoURL,
	).Scan(&v.ID, &v.CreatedAt, &v.UpdatedAt)
}

var vehicleCols = `id, name, vehicle_type, license_plate, capacity_weight_lbs,
	vin, year, make, model, insurance_expiry, next_service_date, odometer_miles, notes, photo_url,
	created_at, updated_at`

func scanVehicle(row interface{ Scan(dest ...any) error }, v *Vehicle) error {
	return row.Scan(
		&v.ID, &v.Name, &v.VehicleType, &v.LicensePlate, &v.CapacityWeightLbs,
		&v.VIN, &v.Year, &v.Make, &v.Model, &v.InsuranceExpiry, &v.NextServiceDate, &v.OdometerMiles, &v.Notes, &v.PhotoURL,
		&v.CreatedAt, &v.UpdatedAt,
	)
}

func (r *PostgresRepository) ListVehicles(ctx context.Context) ([]Vehicle, error) {
	query := `SELECT ` + vehicleCols + ` FROM vehicles WHERE deleted_at IS NULL ORDER BY name ASC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vehicles []Vehicle
	for rows.Next() {
		var v Vehicle
		if err := scanVehicle(rows, &v); err != nil {
			return nil, err
		}
		vehicles = append(vehicles, v)
	}
	return vehicles, nil
}

func (r *PostgresRepository) GetVehicle(ctx context.Context, id uuid.UUID) (*Vehicle, error) {
	query := `SELECT ` + vehicleCols + ` FROM vehicles WHERE id = $1 AND deleted_at IS NULL`
	var v Vehicle
	err := scanVehicle(r.db.GetExecutor(ctx).QueryRow(ctx, query, id), &v)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("vehicle not found")
		}
		return nil, err
	}
	return &v, nil
}

func (r *PostgresRepository) UpdateVehicle(ctx context.Context, id uuid.UUID, v *Vehicle) error {
	query := `
		UPDATE vehicles SET
			name = $1, vehicle_type = $2, license_plate = $3, capacity_weight_lbs = $4,
			vin = $5, year = $6, make = $7, model = $8,
			insurance_expiry = $9, next_service_date = $10, odometer_miles = $11, notes = $12,
			photo_url = $13, updated_at = NOW()
		WHERE id = $14 AND deleted_at IS NULL
		RETURNING updated_at
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		v.Name, v.VehicleType, v.LicensePlate, v.CapacityWeightLbs,
		v.VIN, v.Year, v.Make, v.Model, v.InsuranceExpiry, v.NextServiceDate, v.OdometerMiles, v.Notes,
		v.PhotoURL, id,
	).Scan(&v.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("vehicle not found")
		}
		return err
	}
	return nil
}

func (r *PostgresRepository) DeleteVehicle(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE vehicles SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("vehicle not found")
	}
	return nil
}

func (r *PostgresRepository) CreateDriver(ctx context.Context, d *Driver) error {
	query := `
		INSERT INTO drivers (name, license_number, phone_number, status, cdl_class, cdl_expiry, hire_date, email, photo_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		d.Name, d.LicenseNumber, d.PhoneNumber, d.Status,
		d.CDLClass, d.CDLExpiry, d.HireDate, d.Email, d.PhotoURL,
	).Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
}

var driverCols = `id, name, license_number, phone_number, status, cdl_class, cdl_expiry, hire_date, email, photo_url, created_at, updated_at`

func scanDriver(row interface{ Scan(dest ...any) error }, d *Driver) error {
	return row.Scan(
		&d.ID, &d.Name, &d.LicenseNumber, &d.PhoneNumber, &d.Status,
		&d.CDLClass, &d.CDLExpiry, &d.HireDate, &d.Email, &d.PhotoURL,
		&d.CreatedAt, &d.UpdatedAt,
	)
}

func (r *PostgresRepository) GetDriver(ctx context.Context, id uuid.UUID) (*Driver, error) {
	query := `SELECT ` + driverCols + ` FROM drivers WHERE id = $1 AND deleted_at IS NULL`
	var d Driver
	err := scanDriver(r.db.GetExecutor(ctx).QueryRow(ctx, query, id), &d)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("driver not found")
		}
		return nil, err
	}
	return &d, nil
}

func (r *PostgresRepository) ListDrivers(ctx context.Context) ([]Driver, error) {
	query := `SELECT ` + driverCols + ` FROM drivers WHERE deleted_at IS NULL ORDER BY name ASC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var drivers []Driver
	for rows.Next() {
		var d Driver
		if err := scanDriver(rows, &d); err != nil {
			return nil, err
		}
		drivers = append(drivers, d)
	}
	return drivers, nil
}

func (r *PostgresRepository) UpdateDriver(ctx context.Context, id uuid.UUID, d *Driver) error {
	query := `
		UPDATE drivers SET
			name = $1, license_number = $2, phone_number = $3, status = $4,
			cdl_class = $5, cdl_expiry = $6, hire_date = $7, email = $8,
			photo_url = $9, updated_at = NOW()
		WHERE id = $10 AND deleted_at IS NULL
		RETURNING updated_at
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		d.Name, d.LicenseNumber, d.PhoneNumber, d.Status,
		d.CDLClass, d.CDLExpiry, d.HireDate, d.Email, d.PhotoURL,
		id,
	).Scan(&d.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("driver not found")
		}
		return err
	}
	return nil
}

func (r *PostgresRepository) DeleteDriver(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE drivers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("driver not found")
	}
	return nil
}

// Photos

func (r *PostgresRepository) SetVehiclePhoto(ctx context.Context, id uuid.UUID, url string) error {
	query := `UPDATE vehicles SET photo_url = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, url, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("vehicle not found")
	}
	return nil
}

func (r *PostgresRepository) SetDriverPhoto(ctx context.Context, id uuid.UUID, url string) error {
	query := `UPDATE drivers SET photo_url = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query, url, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("driver not found")
	}
	return nil
}

// Routes

func (r *PostgresRepository) CreateRoute(ctx context.Context, route *Route) error {
	query := `
		INSERT INTO delivery_routes (vehicle_id, driver_id, scheduled_date, status, notes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		route.VehicleID, route.DriverID, route.ScheduledDate, route.Status, route.Notes,
	).Scan(&route.ID, &route.CreatedAt, &route.UpdatedAt)
}

func (r *PostgresRepository) GetRoute(ctx context.Context, id uuid.UUID) (*Route, error) {
	query := `
		SELECT r.id, r.vehicle_id, r.driver_id, r.scheduled_date, r.status, r.notes, r.created_at, r.updated_at,
		       v.name as vehicle_name, d.name as driver_name,
		       (SELECT COUNT(*) FROM deliveries WHERE route_id = r.id) as stop_count
		FROM delivery_routes r
		JOIN vehicles v ON r.vehicle_id = v.id
		JOIN drivers d ON r.driver_id = d.id
		WHERE r.id = $1
	`
	var route Route
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&route.ID, &route.VehicleID, &route.DriverID, &route.ScheduledDate, &route.Status, &route.Notes, &route.CreatedAt, &route.UpdatedAt,
		&route.VehicleName, &route.DriverName, &route.StopCount,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("route not found")
		}
		return nil, err
	}
	return &route, nil
}

func (r *PostgresRepository) ListRoutes(ctx context.Context, date *time.Time, driverID *uuid.UUID) ([]Route, error) {
	query := `
		SELECT r.id, r.vehicle_id, r.driver_id, r.scheduled_date, r.status, r.notes, r.created_at, r.updated_at,
		       v.name as vehicle_name, d.name as driver_name,
		       (SELECT COUNT(*) FROM deliveries WHERE route_id = r.id) as stop_count
		FROM delivery_routes r
		JOIN vehicles v ON r.vehicle_id = v.id
		JOIN drivers d ON r.driver_id = d.id
	`
	args := []any{}
	whereClauses := []string{}

	if date != nil {
		args = append(args, *date)
		whereClauses = append(whereClauses, fmt.Sprintf("r.scheduled_date = $%d", len(args)))
	}
	if driverID != nil {
		args = append(args, *driverID)
		whereClauses = append(whereClauses, fmt.Sprintf("r.driver_id = $%d", len(args)))
	}

	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	query += " ORDER BY r.scheduled_date DESC, r.created_at DESC"

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var routes []Route
	for rows.Next() {
		var route Route
		if err := rows.Scan(
			&route.ID, &route.VehicleID, &route.DriverID, &route.ScheduledDate, &route.Status, &route.Notes, &route.CreatedAt, &route.UpdatedAt,
			&route.VehicleName, &route.DriverName, &route.StopCount,
		); err != nil {
			return nil, err
		}
		routes = append(routes, route)
	}
	return routes, nil
}

func (r *PostgresRepository) UpdateRouteStatus(ctx context.Context, id uuid.UUID, status RouteStatus) error {
	query := `UPDATE delivery_routes SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, id)
	return err
}

// Deliveries

func (r *PostgresRepository) CreateDelivery(ctx context.Context, d *Delivery) error {
	query := `
		INSERT INTO deliveries (route_id, order_id, stop_sequence, status, delivery_instructions, latitude, longitude)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		d.RouteID, d.OrderID, d.StopSequence, d.Status, d.DeliveryInstructions, d.Latitude, d.Longitude,
	).Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
}

func (r *PostgresRepository) GetDelivery(ctx context.Context, id uuid.UUID) (*Delivery, error) {
	query := `
		SELECT d.id, d.route_id, d.order_id, d.stop_sequence, d.status,
		       d.pod_proof_url, d.pod_signed_by, d.pod_timestamp, d.delivery_instructions,
		       d.latitude, d.longitude, d.estimated_arrival,
		       d.created_at, d.updated_at,
		       c.name as customer_name, CAST(o.id AS TEXT) as order_number
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		JOIN customers c ON o.customer_id = c.id
		WHERE d.id = $1
	`
	var d Delivery
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&d.ID, &d.RouteID, &d.OrderID, &d.StopSequence, &d.Status,
		&d.PODProofURL, &d.PODSignedBy, &d.PODTimestamp, &d.DeliveryInstructions,
		&d.Latitude, &d.Longitude, &d.EstimatedArrival,
		&d.CreatedAt, &d.UpdatedAt,
		&d.CustomerName, &d.OrderNumber,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("delivery not found")
		}
		return nil, err
	}
	return &d, nil
}

func (r *PostgresRepository) ListDeliveriesByRoute(ctx context.Context, routeID uuid.UUID) ([]Delivery, error) {
	query := `
		SELECT d.id, d.route_id, d.order_id, d.stop_sequence, d.status,
		       d.pod_proof_url, d.pod_signed_by, d.pod_timestamp, d.delivery_instructions,
		       d.latitude, d.longitude, d.estimated_arrival,
		       d.created_at, d.updated_at,
		       c.name as customer_name, CAST(o.id AS TEXT) as order_number,
		       -- Assuming customer address is what we want here, or job site address
		       c.address as address
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		JOIN customers c ON o.customer_id = c.id
		WHERE d.route_id = $1
		ORDER BY d.stop_sequence ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, routeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deliveries []Delivery
	for rows.Next() {
		var d Delivery
		if err := rows.Scan(
			&d.ID, &d.RouteID, &d.OrderID, &d.StopSequence, &d.Status,
			&d.PODProofURL, &d.PODSignedBy, &d.PODTimestamp, &d.DeliveryInstructions,
			&d.Latitude, &d.Longitude, &d.EstimatedArrival,
			&d.CreatedAt, &d.UpdatedAt,
			&d.CustomerName, &d.OrderNumber, &d.Address,
		); err != nil {
			return nil, err
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}

func (r *PostgresRepository) UpdateDeliveryStatus(ctx context.Context, id uuid.UUID, status DeliveryStatus, pod *PODUpdate) error {
	if pod != nil {
		query := `
			UPDATE deliveries 
			SET status = $1, pod_proof_url = $2, pod_signed_by = $3, pod_timestamp = $4, 
			    signature_data_url = $5, updated_at = NOW() 
			WHERE id = $6
		`
		_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, pod.ProofURL, pod.SignedBy, pod.Time, pod.SignatureDataURL, id)
		return err
	}

	query := `UPDATE deliveries SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, id)
	return err
}

// POD Photos

func (r *PostgresRepository) SavePODPhoto(ctx context.Context, photo *PODPhoto) error {
	if photo.ID == uuid.Nil {
		photo.ID = uuid.New()
	}
	photo.UploadedAt = time.Now()

	query := `
		INSERT INTO delivery_pod_photos (id, delivery_id, photo_url, photo_type, uploaded_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		photo.ID, photo.DeliveryID, photo.PhotoURL, photo.PhotoType, photo.UploadedAt,
	)
	return err
}

func (r *PostgresRepository) GetPODPhotos(ctx context.Context, deliveryID uuid.UUID) ([]PODPhoto, error) {
	query := `
		SELECT id, delivery_id, photo_url, photo_type, uploaded_at
		FROM delivery_pod_photos
		WHERE delivery_id = $1
		ORDER BY uploaded_at ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, deliveryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var photos []PODPhoto
	for rows.Next() {
		var p PODPhoto
		if err := rows.Scan(&p.ID, &p.DeliveryID, &p.PhotoURL, &p.PhotoType, &p.UploadedAt); err != nil {
			return nil, err
		}
		photos = append(photos, p)
	}
	return photos, nil
}

func (r *PostgresRepository) ReorderRouteDeliveries(ctx context.Context, routeID uuid.UUID, deliveryIDs []uuid.UUID) error {
	return r.db.RunInTx(ctx, func(ctx context.Context) error {
		for i, id := range deliveryIDs {
			query := `UPDATE deliveries SET stop_sequence = $1, updated_at = NOW() WHERE id = $2 AND route_id = $3`
			if _, err := r.db.GetExecutor(ctx).Exec(ctx, query, i+1, id, routeID); err != nil {
				return err
			}
		}
		return nil
	})
}

// Capacity

func (r *PostgresRepository) GetRouteLoadWeight(ctx context.Context, routeID uuid.UUID) (float64, error) {
	query := `
		SELECT COALESCE(SUM(
			COALESCE(p.weight_lbs, 0) * ol.quantity
		), 0)
		FROM deliveries d
		JOIN order_lines ol ON ol.order_id = d.order_id
		JOIN products p ON p.id = ol.product_id
		WHERE d.route_id = $1
	`
	var weight float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, routeID).Scan(&weight)
	return weight, err
}

func (r *PostgresRepository) GetOrderEstimatedWeight(ctx context.Context, orderID uuid.UUID) (float64, error) {
	query := `
		SELECT COALESCE(SUM(
			COALESCE(p.weight_lbs, 0) * ol.quantity
		), 0)
		FROM order_lines ol
		JOIN products p ON p.id = ol.product_id
		WHERE ol.order_id = $1
	`
	var weight float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, orderID).Scan(&weight)
	return weight, err
}

// Branch origin (route start/end) + geocoding backfill

// BranchOrigin holds a branch's stored coordinates (nil until backfilled) and
// the composed street address used to geocode it.
type BranchOrigin struct {
	BranchID  uuid.UUID
	Latitude  *float64
	Longitude *float64
	Address   string // composed "street, city, state zip" for geocoding
}

// GetRouteBranchID resolves the branch a route belongs to via its orders
// (routes are single-branch in practice; we read the first stop). Falls back to
// system_settings.default_branch_id when the route has no deliveries yet.
func (r *PostgresRepository) GetRouteBranchID(ctx context.Context, routeID uuid.UUID) (uuid.UUID, error) {
	var branchID uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `
		SELECT o.branch_id
		FROM deliveries d
		JOIN orders o ON d.order_id = o.id
		WHERE d.route_id = $1
		ORDER BY d.stop_sequence ASC
		LIMIT 1
	`, routeID).Scan(&branchID)
	if err == pgx.ErrNoRows {
		err = r.db.GetExecutor(ctx).QueryRow(ctx,
			`SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id'`).Scan(&branchID)
	}
	if err != nil {
		return uuid.Nil, err
	}
	return branchID, nil
}

// GetBranchOrigin loads a branch's stored coordinates and composed address.
func (r *PostgresRepository) GetBranchOrigin(ctx context.Context, branchID uuid.UUID) (*BranchOrigin, error) {
	var (
		lat, lng               *float64
		addr, city, state, zip *string
	)
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `
		SELECT latitude, longitude, address, city, state, zip
		FROM locations WHERE id = $1
	`, branchID).Scan(&lat, &lng, &addr, &city, &state, &zip)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("branch not found")
		}
		return nil, err
	}
	return &BranchOrigin{
		BranchID:  branchID,
		Latitude:  lat,
		Longitude: lng,
		Address:   composeBranchAddress(addr, city, state, zip),
	}, nil
}

// SetBranchLatLng persists a backfilled branch geocode.
func (r *PostgresRepository) SetBranchLatLng(ctx context.Context, branchID uuid.UUID, lat, lng float64) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE locations SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3`,
		lat, lng, branchID)
	return err
}

// composeBranchAddress joins a branch's structured address parts into a single
// free-text string for geocoding, e.g. "2450 Enterprise Way, Kelowna, BC V1X 7K2".
func composeBranchAddress(addr, city, state, zip *string) string {
	deref := func(p *string) string {
		if p == nil {
			return ""
		}
		return strings.TrimSpace(*p)
	}
	parts := []string{}
	if a := deref(addr); a != "" {
		parts = append(parts, a)
	}
	if c := deref(city); c != "" {
		parts = append(parts, c)
	}
	if sz := strings.TrimSpace(deref(state) + " " + deref(zip)); sz != "" {
		parts = append(parts, sz)
	}
	return strings.Join(parts, ", ")
}

// GetOrderDeliveryAddress returns the delivery address for an order (the
// customer's address). Used to geocode a new delivery stop in AssignOrderToRoute.
func (r *PostgresRepository) GetOrderDeliveryAddress(ctx context.Context, orderID uuid.UUID) (string, error) {
	var addr *string
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `
		SELECT c.address
		FROM orders o
		JOIN customers c ON o.customer_id = c.id
		WHERE o.id = $1
	`, orderID).Scan(&addr)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", fmt.Errorf("order not found")
		}
		return "", err
	}
	if addr == nil {
		return "", nil
	}
	return strings.TrimSpace(*addr), nil
}

// SetDeliveryLatLng persists geocoded coordinates for a delivery (used by the
// optimize path to backfill stops that were created without coordinates).
func (r *PostgresRepository) SetDeliveryLatLng(ctx context.Context, deliveryID uuid.UUID, lat, lng float64) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE deliveries SET latitude = $1, longitude = $2, updated_at = NOW() WHERE id = $3`,
		lat, lng, deliveryID)
	return err
}

// SetDeliveryETA persists an optimized estimated arrival time for a delivery.
func (r *PostgresRepository) SetDeliveryETA(ctx context.Context, deliveryID uuid.UUID, eta time.Time) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE deliveries SET estimated_arrival = $1, updated_at = NOW() WHERE id = $2`,
		eta, deliveryID)
	return err
}
