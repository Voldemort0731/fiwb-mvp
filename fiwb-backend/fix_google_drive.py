import sqlite3
from datetime import datetime

db_path = "fiwb.db"

def fix_google_drive():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get user ID for owaissayyed2007@gmail.com
    cursor.execute("SELECT id FROM users WHERE email = 'owaissayyed2007@gmail.com'")
    user_result = cursor.fetchone()
    
    if not user_result:
        print("User not found!")
        conn.close()
        return
    
    user_id = user_result[0]
    print(f"Found user ID: {user_id}")
    
    # Update all GOOGLE_DRIVE materials to have the correct user_id
    cursor.execute("""
        UPDATE materials 
        SET user_id = ? 
        WHERE course_id = 'GOOGLE_DRIVE' AND user_id IS NULL
    """, (user_id,))
    
    updated_materials = cursor.rowcount
    print(f"Updated {updated_materials} materials with user_id")
    
    # Check if user is linked to GOOGLE_DRIVE course
    cursor.execute("""
        SELECT * FROM user_courses 
        WHERE user_id = ? AND course_id = 'GOOGLE_DRIVE'
    """, (user_id,))
    
    if not cursor.fetchone():
        # Link user to GOOGLE_DRIVE course
        cursor.execute("""
            INSERT INTO user_courses (user_id, course_id, last_synced)
            VALUES (?, 'GOOGLE_DRIVE', ?)
        """, (user_id, datetime.utcnow().isoformat()))
        print("Linked user to GOOGLE_DRIVE course")
    else:
        print("User already linked to GOOGLE_DRIVE course")
    
    conn.commit()
    
    # Verify the fix
    cursor.execute("""
        SELECT COUNT(*) FROM materials 
        WHERE course_id = 'GOOGLE_DRIVE' AND user_id = ?
    """, (user_id,))
    count = cursor.fetchone()[0]
    print(f"\nVerification: {count} Google Drive materials now belong to user {user_id}")
    
    conn.close()
    print("\n✅ Fix completed!")

if __name__ == "__main__":
    fix_google_drive()
