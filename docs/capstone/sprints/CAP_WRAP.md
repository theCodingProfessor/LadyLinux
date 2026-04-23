## Two Branches Exist, The Goal is for One

online/main
https://github.com/theCodingProfessor/LadyLinux/tree/main

online/dev
https://github.com/theCodingProfessor/LadyLinux/tree/Capstone_Dev_01

online/dar
https://github.com/theCodingProfessor/LadyLinux/tree/darrius

local/feb_lady: Local Windows PyCharm Environment

The online/dev is the current working branch
The local/feb_lady started this spring as an up to date Capstone_Dev_01 (online/dev)
Zip files as branch /darrius are received
New files are added (without name changes) and old files are updated (with _v3 name changes)
Now the local branch has the new code, but it is untested and may be broken

Workflow to stage and make a new combined branch:
git stash push -u -m "Capstone Current Plus Imported Code"

git switch -c colab/import-darrius-code

git stash apply
# git stash pop

git add . 

git commit -m "ToDo: De-Duplicate RAG, Unify Interface, Define Models"

git push -u origin colab/import-darrius-code git switch <colab/import-darrius-code>

git fetch origin git reset --hard origin/<routine-branch> 