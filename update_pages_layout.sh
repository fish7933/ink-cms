#!/bin/bash

# List of pages to update (excluding LoginPage, Index, and pages already using Layout)
pages=(
  "ApprovalInboxPage.tsx"
  "ApprovalLineManagementPage.tsx"
  "ApprovalManagementPage.tsx"
  "CertificateTypeManagementPage.tsx"
  "CompanyManagementPage.tsx"
  "CrewAssignmentPage.tsx"
  "CrewDetailPage.tsx"
  "CrewManagementPage.tsx"
  "CrewRecommendationsPage.tsx"
  "FleetManagementPage.tsx"
  "JobPostingPage.tsx"
  "JobPostingsPage.tsx"
  "ManagerAssignmentPage.tsx"
  "MyRecommendationsPage.tsx"
  "NationalityManagementPage.tsx"
  "NotFound.tsx"
  "PermissionsPage.tsx"
  "ProfilePage.tsx"
  "RanksPage.tsx"
  "RecommendationReviewPage.tsx"
  "SalaryComponentsPage.tsx"
  "SalaryTemplatesPage.tsx"
  "ShipFlagManagementPage.tsx"
  "ShipManagementPage.tsx"
  "ShipTypeManagementPage.tsx"
  "ShorePositionsPage.tsx"
  "SupervisorManagementPage.tsx"
  "UserGroupManagementPage.tsx"
)

for page in "${pages[@]}"; do
  file="src/pages/$page"
  
  if [ -f "$file" ]; then
    echo "Processing $page..."
    
    # Check if it imports Header
    if grep -q "import Header from '@/components/Header'" "$file"; then
      # Replace Header import with Layout import
      sed -i "s|import Header from '@/components/Header';|import Layout from '@/components/Layout';|g" "$file"
      
      # Remove the Header component usage and wrap content with Layout
      # This is a complex transformation, we'll handle it per file
      echo "  - Replaced Header import with Layout import"
    fi
  fi
done

echo "Done! Please review the changes."
