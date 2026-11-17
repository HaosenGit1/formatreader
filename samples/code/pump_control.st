(* PLC Structured Text sample (IEC 61131-3) *)
PROGRAM PumpControl
VAR
    Level      : REAL;
    PumpOn     : BOOL;
    HighLimit  : REAL := 80.0;
    LowLimit   : REAL := 20.0;
END_VAR

IF Level >= HighLimit THEN
    PumpOn := TRUE;
ELSIF Level <= LowLimit THEN
    PumpOn := FALSE;
END_IF;
END_PROGRAM
