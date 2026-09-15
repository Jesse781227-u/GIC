CREATE TABLE IF NOT EXISTS church_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  address text NOT NULL,
  service_times text,
  contact_info text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS church_locations_active_idx ON church_locations(active);

CREATE TABLE IF NOT EXISTS bus_pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  address text NOT NULL,
  manager_name text NOT NULL,
  manager_phone text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bus_pickup_points_active_idx ON bus_pickup_points(active);

ALTER TABLE event_pickup_locations
  ADD COLUMN IF NOT EXISTS bus_pickup_point_id uuid REFERENCES bus_pickup_points(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS event_pickup_locations_bus_pickup_point_id_idx ON event_pickup_locations(bus_pickup_point_id);

INSERT INTO church_locations (name, address, service_times, contact_info) VALUES
  ('HQ – The Goodland', 'The Goodland, Ifako Bus Stop, Oworoshoki Expressway, Lagos', 'Sun: 7:00, 8:45, 10:30 AM. Wed: 6:00 PM.', NULL),
  ('Surulere Branch', '277 Babs Animashaun, Surulere, Lagos', 'Sun: 7:30, 9:30, 11:30 AM. Wed: 6:00 PM.', NULL),
  ('Lekki Branch', 'L''avenida Multipurpose Hall, Lakeview Park One, opp. Ikota Shopping Complex after VGC', 'Sun: 9:00 AM. Wed: 6:00 PM.', NULL),
  ('Isolo Branch', '123 Mushin Road, beside Isolo General Hospital, Isolo, Lagos 100026', NULL, NULL),
  ('Abuja Branch', 'Decency Event Center, Accra Street, Wuse Zone 5, Abuja', NULL, 'Enquiries: 08068059584, 08068594949')
ON CONFLICT (name) DO NOTHING;

INSERT INTO bus_pickup_points (name, address, manager_name, manager_phone) VALUES
  ('Agbara/Oko Afo', 'MRS Filling Station, Oko Afo Bus Stop, Lagos–Badagry Expressway, Agbara Badagry 103101', 'Ebenezer', '09029277207'),
  ('Iyana Iba', 'Iyana School Bus Stop, Summit Road, LASU Road, Ojo, Iba 104102', 'Alex', '08052863586'),
  ('Isolo/Cele/Jakande Gate', 'MRS Filling Station Jakande Gate, Oke-Afa, Egbe Road, Lagos', 'Temidayo', '08133367072'),
  ('Alagbole/Akute', 'Foursquare Gospel Church, Alagbole–Akute Road, near FirstBank, Ajuwon/Akute 112107, Ogun', 'Michael', '08135386750'),
  ('Iju Ishaga', 'BRT Bus Station, opp. County Estate, Pen Cinema, Ifako Agege 101232', 'Newton', '08037671006'),
  ('Ogba/Ikeja', 'Excellence Hotel Aguda, Ijaiye Rd/Yaya Abatan Roundabout, Ogba 101233', 'Newton', '08037671006'),
  ('Gbagada/New Garage', 'R Jolad Hospital Gbagada, Ashimowu St, off Akindele/Diya St, Abule Okuta 102216', 'Temitope', '09075788256'),
  ('Ayobo', '23 Captain David Road, 8/9 Bus Stop, Ayobo', 'Faith', '08067028304'),
  ('Ikorodu', 'Benson Bus Stop, beside Union Bank, Ikorodu Garage', 'Abiodun', '07031667710'),
  ('Alimosho/Iyana Ipaja', 'Iyana Ipaja Bus Stop', 'Victoria', '08136955641'),
  ('Mowe/Ibafo', 'Mowe AP Filling Station', 'Blessing', '08103879518'),
  ('Unilag/Yabatech', 'Unilag Gate/Ilaje', 'Munachi', '08156670376'),
  ('Oworonshoki', 'First Bank, Oworonshoki Road', 'Esther', '08184480272'),
  ('Irawo/Owode/Mile 12', 'Irawo Bus Stop/Mile 12', 'Omolara', '08065916534'),
  ('Ketu/Alapere', 'Tantalizer Eatery, Alapere', 'Emmanuel', '08027209567'),
  ('Berger', 'Berger Bus Stop', 'Linus', '07031838141'),
  ('Ifako/Yetunde Brown', 'UBA Ifako', 'Emmanuel', '07038497025')
ON CONFLICT (name) DO NOTHING;