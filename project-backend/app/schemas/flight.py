from pydantic import BaseModel


class FlightPointOut(BaseModel):
    seq: int
    lng: float
    lat: float
    altitude: float

    model_config = {"from_attributes": True}


class FlightRouteOut(BaseModel):
    id: int
    name: str
    points: list[FlightPointOut]
