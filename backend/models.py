from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class AnalysisRecord(Base):
    __tablename__ = "analysis_records"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20))  # "text" or "image"
    content = Column(Text)
    category = Column(String(50))  # "CALENDAR" or "MEMO"
    summary = Column(String(500))
    date = Column(String(50), nullable=True)
    tags = Column(Text)  # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
