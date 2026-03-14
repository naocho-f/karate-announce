export type Dojo = {
  id: string;
  name: string;
  name_reading: string | null;
  created_at: string;
};

export type Fighter = {
  id: string;
  name: string;
  name_reading: string | null;
  dojo_id: string;
  dojo?: Dojo;
  created_at: string;
};

export type Tournament = {
  id: string;
  name: string;
  court: string;
  status: "preparing" | "ongoing" | "finished";
  created_at: string;
};

export type Match = {
  id: string;
  tournament_id: string;
  round: number;
  position: number;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  status: "waiting" | "ready" | "ongoing" | "done";
  fighter1?: Fighter | null;
  fighter2?: Fighter | null;
  winner?: Fighter | null;
};
