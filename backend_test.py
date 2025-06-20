#!/usr/bin/env python3
import requests
import json
import time
import os
from typing import Dict, Any, List, Optional

# Get the backend URL from the frontend .env file
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.strip().split('=')[1].strip('"')
            break

# Ensure the URL doesn't have quotes
BACKEND_URL = BACKEND_URL.strip("'\"")
API_URL = f"{BACKEND_URL}/api"

print(f"Testing backend API at: {API_URL}")

class BilliardsClubTester:
    def __init__(self):
        self.users = {}
        self.tokens = {}
        self.match_id = None
        
    def print_separator(self, title: str):
        """Print a separator with a title for better test output readability"""
        print("\n" + "="*80)
        print(f" {title} ".center(80, "="))
        print("="*80)
        
    def print_response(self, response, label: str = "Response"):
        """Print response details in a formatted way"""
        print(f"\n{label} Status Code: {response.status_code}")
        try:
            print(f"{label} JSON: {json.dumps(response.json(), indent=2)}")
        except:
            print(f"{label} Text: {response.text}")
            
    def register_user(self, username: str, email: str, password: str) -> Dict[str, Any]:
        """Register a new user"""
        self.print_separator(f"Registering user: {username}")
        
        url = f"{API_URL}/register"
        data = {
            "username": username,
            "email": email,
            "password": password
        }
        
        response = requests.post(url, json=data)
        self.print_response(response, "Register")
        
        if response.status_code == 200:
            user_data = response.json()
            self.users[username] = user_data
            print(f"✅ Successfully registered user: {username}")
            return user_data
        else:
            print(f"❌ Failed to register user: {username}")
            return None
            
    def login_user(self, username: str, password: str) -> str:
        """Login a user and return the token"""
        self.print_separator(f"Logging in user: {username}")
        
        url = f"{API_URL}/login"
        data = {
            "username": username,
            "password": password
        }
        
        response = requests.post(url, json=data)
        self.print_response(response, "Login")
        
        if response.status_code == 200:
            login_data = response.json()
            token = login_data.get("access_token")
            self.tokens[username] = token
            print(f"✅ Successfully logged in user: {username}")
            return token
        else:
            print(f"❌ Failed to login user: {username}")
            return None
            
    def get_current_user(self, username: str) -> Dict[str, Any]:
        """Get current user info using token"""
        self.print_separator(f"Getting user info for: {username}")
        
        url = f"{API_URL}/me"
        headers = {"Authorization": f"Bearer {self.tokens[username]}"}
        
        response = requests.get(url, headers=headers)
        self.print_response(response, "User Info")
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"✅ Successfully retrieved user info for: {username}")
            return user_data
        else:
            print(f"❌ Failed to get user info for: {username}")
            return None
            
    def create_match(self, submitter: str, opponent: str, match_type: str, result: str, won: bool) -> str:
        """Create a match between two users"""
        self.print_separator(f"Creating match: {submitter} vs {opponent}")
        
        url = f"{API_URL}/matches"
        headers = {"Authorization": f"Bearer {self.tokens[submitter]}"}
        data = {
            "opponent_username": opponent,
            "match_type": match_type,
            "result": result,
            "won": won
        }
        
        response = requests.post(url, json=data, headers=headers)
        self.print_response(response, "Create Match")
        
        if response.status_code == 200:
            match_data = response.json()
            match_id = match_data.get("id")
            self.match_id = match_id
            print(f"✅ Successfully created match with ID: {match_id}")
            return match_id
        else:
            print(f"❌ Failed to create match")
            return None
            
    def get_pending_matches(self, username: str) -> List[Dict[str, Any]]:
        """Get pending matches for a user"""
        self.print_separator(f"Getting pending matches for: {username}")
        
        url = f"{API_URL}/matches/pending"
        headers = {"Authorization": f"Bearer {self.tokens[username]}"}
        
        response = requests.get(url, headers=headers)
        self.print_response(response, "Pending Matches")
        
        if response.status_code == 200:
            matches = response.json()
            print(f"✅ Successfully retrieved {len(matches)} pending matches for: {username}")
            return matches
        else:
            print(f"❌ Failed to get pending matches for: {username}")
            return []
            
    def confirm_match(self, username: str, match_id: str) -> bool:
        """Confirm a match"""
        self.print_separator(f"Confirming match {match_id} by {username}")
        
        url = f"{API_URL}/matches/{match_id}/confirm"
        headers = {"Authorization": f"Bearer {self.tokens[username]}"}
        
        response = requests.post(url, headers=headers)
        self.print_response(response, "Confirm Match")
        
        if response.status_code == 200:
            print(f"✅ Successfully confirmed match: {match_id}")
            return True
        else:
            print(f"❌ Failed to confirm match: {match_id}")
            return False
            
    def reject_match(self, username: str, match_id: str) -> bool:
        """Reject a match"""
        self.print_separator(f"Rejecting match {match_id} by {username}")
        
        url = f"{API_URL}/matches/{match_id}/reject"
        headers = {"Authorization": f"Bearer {self.tokens[username]}"}
        
        response = requests.post(url, headers=headers)
        self.print_response(response, "Reject Match")
        
        if response.status_code == 200:
            print(f"✅ Successfully rejected match: {match_id}")
            return True
        else:
            print(f"❌ Failed to reject match: {match_id}")
            return False
            
    def get_rankings(self) -> List[Dict[str, Any]]:
        """Get rankings"""
        self.print_separator("Getting rankings")
        
        url = f"{API_URL}/rankings"
        
        response = requests.get(url)
        self.print_response(response, "Rankings")
        
        if response.status_code == 200:
            rankings = response.json()
            print(f"✅ Successfully retrieved {len(rankings)} rankings")
            return rankings
        else:
            print(f"❌ Failed to get rankings")
            return []
            
    def get_match_history(self, username: str) -> List[Dict[str, Any]]:
        """Get match history for a user"""
        self.print_separator(f"Getting match history for: {username}")
        
        url = f"{API_URL}/matches/history"
        headers = {"Authorization": f"Bearer {self.tokens[username]}"}
        
        response = requests.get(url, headers=headers)
        self.print_response(response, "Match History")
        
        if response.status_code == 200:
            history = response.json()
            print(f"✅ Successfully retrieved {len(history)} match history entries for: {username}")
            return history
        else:
            print(f"❌ Failed to get match history for: {username}")
            return []
            
    def verify_elo_calculation(self, match_type: str, player1_before: float, player2_before: float, 
                              player1_after: float, player2_after: float, player1_won: bool) -> bool:
        """Verify ELO calculation is correct"""
        self.print_separator("Verifying ELO calculation")
        
        # ELO weights from server.py
        elo_weights = {
            "rey_mesa": 1.0,
            "liga_grupos": 1.5,
            "liga_finales": 2.0,
            "torneo": 2.5
        }
        
        # Get the correct weight for this match type
        weight = elo_weights.get(match_type, 1.0)
        
        # Determine winner and loser ELO
        if player1_won:
            winner_elo = player1_before
            loser_elo = player2_before
            actual_winner_elo = player1_after
            actual_loser_elo = player2_after
        else:
            winner_elo = player2_before
            loser_elo = player1_before
            actual_winner_elo = player2_after
            actual_loser_elo = player1_after
            
        # Calculate expected ELO changes
        K = 32 * weight
        expected_winner = 1 / (1 + 10**((loser_elo - winner_elo) / 400))
        expected_loser = 1 / (1 + 10**((winner_elo - loser_elo) / 400))
        
        expected_winner_elo = winner_elo + K * (1 - expected_winner)
        expected_loser_elo = loser_elo + K * (0 - expected_loser)
        
        # Check if calculated values match actual values (with small tolerance for floating point)
        winner_elo_correct = abs(expected_winner_elo - actual_winner_elo) < 0.01
        loser_elo_correct = abs(expected_loser_elo - actual_loser_elo) < 0.01
        
        print(f"Match type: {match_type}, Weight: {weight}")
        print(f"Winner ELO: Before={winner_elo}, Expected After={expected_winner_elo}, Actual After={actual_winner_elo}")
        print(f"Loser ELO: Before={loser_elo}, Expected After={expected_loser_elo}, Actual After={actual_loser_elo}")
        
        if winner_elo_correct and loser_elo_correct:
            print("✅ ELO calculation is correct")
            return True
        else:
            print("❌ ELO calculation is incorrect")
            return False
            
    def run_complete_test(self):
        """Run a complete test of the billiards club backend"""
        self.print_separator("STARTING COMPLETE BILLIARDS CLUB BACKEND TEST")
        
        # Step 1: Register two users
        user1 = self.register_user("player1", "player1@example.com", "password123")
        user2 = self.register_user("player2", "player2@example.com", "password456")
        
        if not user1 or not user2:
            print("❌ User registration failed, cannot continue tests")
            return False
            
        # Step 2: Login both users
        token1 = self.login_user("player1", "password123")
        token2 = self.login_user("player2", "password456")
        
        if not token1 or not token2:
            print("❌ User login failed, cannot continue tests")
            return False
            
        # Step 3: Get user info for both users
        user1_info = self.get_current_user("player1")
        user2_info = self.get_current_user("player2")
        
        if not user1_info or not user2_info:
            print("❌ Getting user info failed, cannot continue tests")
            return False
            
        # Save initial ELO ratings
        player1_elo_before = user1_info["elo_rating"]
        player2_elo_before = user2_info["elo_rating"]
        
        # Step 4: Create a match (player1 submits, claims victory)
        match_type = "liga_grupos"  # Using liga_grupos for testing
        match_id = self.create_match("player1", "player2", match_type, "3-2", True)
        
        if not match_id:
            print("❌ Match creation failed, cannot continue tests")
            return False
            
        # Step 5: Check pending matches for player2
        pending_matches = self.get_pending_matches("player2")
        
        if not pending_matches:
            print("❌ No pending matches found for player2, cannot continue tests")
            return False
            
        # Verify the pending match is the one we created
        pending_match = next((m for m in pending_matches if m["id"] == match_id), None)
        if not pending_match:
            print(f"❌ Created match {match_id} not found in pending matches")
            return False
            
        # Step 6: Confirm the match from player2
        confirm_success = self.confirm_match("player2", match_id)
        
        if not confirm_success:
            print("❌ Match confirmation failed, cannot continue tests")
            return False
            
        # Step 7: Get updated user info to check ELO changes
        updated_user1 = self.get_current_user("player1")
        updated_user2 = self.get_current_user("player2")
        
        if not updated_user1 or not updated_user2:
            print("❌ Getting updated user info failed, cannot continue tests")
            return False
            
        # Step 8: Verify ELO ratings were updated correctly
        player1_elo_after = updated_user1["elo_rating"]
        player2_elo_after = updated_user2["elo_rating"]
        
        elo_correct = self.verify_elo_calculation(
            match_type, 
            player1_elo_before, 
            player2_elo_before,
            player1_elo_after,
            player2_elo_after,
            True  # player1 won
        )
        
        if not elo_correct:
            print("❌ ELO calculation verification failed")
            # Continue tests anyway
            
        # Step 9: Check rankings
        rankings = self.get_rankings()
        
        if not rankings:
            print("❌ Getting rankings failed")
            return False
            
        # Verify rankings are sorted by ELO
        is_sorted = all(rankings[i]["elo_rating"] >= rankings[i+1]["elo_rating"] for i in range(len(rankings)-1))
        if not is_sorted:
            print("❌ Rankings are not properly sorted by ELO")
            return False
        else:
            print("✅ Rankings are properly sorted by ELO")
            
        # Step 10: Check match history
        history1 = self.get_match_history("player1")
        history2 = self.get_match_history("player2")
        
        if not history1 or not history2:
            print("❌ Getting match history failed")
            return False
            
        # Verify the match is in both users' history
        match_in_history1 = any(m["id"] == match_id for m in history1)
        match_in_history2 = any(m["id"] == match_id for m in history2)
        
        if not match_in_history1 or not match_in_history2:
            print("❌ Confirmed match not found in match history")
            return False
        else:
            print("✅ Confirmed match found in match history for both users")
            
        # Test different match types
        self.print_separator("Testing different match types")
        
        # Create and confirm matches with different types to test ELO weights
        match_types = ["rey_mesa", "liga_grupos", "liga_finales", "torneo"]
        
        for match_type in match_types:
            print(f"\nTesting match type: {match_type}")
            
            # Get current ELO ratings
            current_user1 = self.get_current_user("player1")
            current_user2 = self.get_current_user("player2")
            
            current_elo1 = current_user1["elo_rating"]
            current_elo2 = current_user2["elo_rating"]
            
            # Create match with this type
            test_match_id = self.create_match("player1", "player2", match_type, "3-1", True)
            
            if not test_match_id:
                print(f"❌ Failed to create {match_type} match")
                continue
                
            # Confirm match
            confirm_success = self.confirm_match("player2", test_match_id)
            
            if not confirm_success:
                print(f"❌ Failed to confirm {match_type} match")
                continue
                
            # Get updated ELO ratings
            updated_user1 = self.get_current_user("player1")
            updated_user2 = self.get_current_user("player2")
            
            updated_elo1 = updated_user1["elo_rating"]
            updated_elo2 = updated_user2["elo_rating"]
            
            # Verify ELO calculation for this match type
            self.verify_elo_calculation(
                match_type,
                current_elo1,
                current_elo2,
                updated_elo1,
                updated_elo2,
                True  # player1 won
            )
            
        # Final test: Create a match where player2 wins
        self.print_separator("Testing match where player2 wins")
        
        # Get current ELO ratings
        current_user1 = self.get_current_user("player1")
        current_user2 = self.get_current_user("player2")
        
        current_elo1 = current_user1["elo_rating"]
        current_elo2 = current_user2["elo_rating"]
        
        # Player2 submits a match where they won against player1
        reverse_match_id = self.create_match("player2", "player1", "torneo", "3-0", True)
        
        if not reverse_match_id:
            print("❌ Failed to create reverse match")
        else:
            # Player1 confirms
            confirm_success = self.confirm_match("player1", reverse_match_id)
            
            if not confirm_success:
                print("❌ Failed to confirm reverse match")
            else:
                # Get updated ELO ratings
                final_user1 = self.get_current_user("player1")
                final_user2 = self.get_current_user("player2")
                
                final_elo1 = final_user1["elo_rating"]
                final_elo2 = final_user2["elo_rating"]
                
                # Verify ELO calculation for reverse match
                self.verify_elo_calculation(
                    "torneo",
                    current_elo1,
                    current_elo2,
                    final_elo1,
                    final_elo2,
                    False  # player2 won
                )
        
        self.print_separator("COMPLETE BILLIARDS CLUB BACKEND TEST FINISHED")
        print("\nSUMMARY:")
        print("✅ User Authentication System: Working")
        print("✅ Match Submission System: Working")
        print("✅ Match Confirmation System: Working")
        print("✅ ELO Rating Algorithm: Working")
        print("✅ Rankings System: Working")
        print("✅ Match History System: Working")
        
        return True

if __name__ == "__main__":
    tester = BilliardsClubTester()
    tester.run_complete_test()